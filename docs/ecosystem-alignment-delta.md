# Ecosystem Technology Alignment -- Delta Document

> **Scopo:** Tutto cio' che e' stato deciso durante la sessione di allineamento unitAI/Agent Forge/Mercury Terminal che NON e' contenuto nella spec unitAI v0.3.0, e che deve essere propagato ai rispettivi PRD.
>
> **Destinazione:** Passare a Claude Code locale per aggiornare i PRD di Agent Forge e Mercury Terminal.
>
> **Fonte:** Sessione di design del 3-4 Marzo 2026.

---

## A. Decisioni che impattano Agent Forge PRD

### A.1 Runtime: migrazione a Bun/TS

**Decisione:** L'intero ecosistema adotta Bun/TS. unitAI migra da Node/TS a Bun/TS.

**Impatto sul PRD Agent Forge:**
- Se il PRD dice "Node/TS" da qualche parte, va aggiornato a "Bun/TS"
- `better-sqlite3` va sostituito con `bun:sqlite` nativo (zero dipendenze di compilazione nativa)
- Il package manager di riferimento e' `bun install`, non `npm install`
- Il test framework e' Vitest (compatibile con Bun)
- Distribuzione npm via `bun build --target=node` per compatibilita' utenti senza Bun
- `bunfig.toml` sostituisce configurazioni Node-specifiche

### A.2 Circuit breaker: upgrade a 3 stati

**Decisione:** Il circuit breaker e' a 3 stati (CLOSED / HALF_OPEN / OPEN), non binario.

**Impatto sul PRD Agent Forge:**
- Se il PRD descrive un circuit breaker binario (up/down), va aggiornato
- Modello condiviso:
  - CLOSED: operazione normale, traccia fallimenti consecutivi
  - OPEN: tutte le richieste falliscono immediatamente, usa fallback. Scatta dopo N fallimenti consecutivi (default: 3)
  - HALF_OPEN: permette una richiesta di prova dopo cooldown (default: 60s). Successo -> CLOSED, fallimento -> OPEN
- Agent Forge mantiene la sua estensione: git-diff progress detection (se N cicli senza modifiche, il circuit si apre). Questo e' Forge-specifico e NON va portato in unitAI

### A.3 AF_STATUS: parsing completo ovunque

**Decisione:** Il parsing dell'AF_STATUS block e' identico in tutti i sistemi. Nessuna versione "semplificata".

**Impatto sul PRD Agent Forge:**
- Confermare che il formato AF_STATUS e' il contratto condiviso
- La logica di parsing sara' parte del pacchetto condiviso `@jaggerxtrm/specialist-loader`
- unitAI legge AF_STATUS da stdout del CLI, Agent Forge dal log file (pipe-pane). Il formato e' lo stesso, solo la sorgente cambia
- Il PRD dovrebbe specificare che il formato AF_STATUS non va modificato unilateralmente

### A.4 Specialist YAML: schema superset con campo `execution.mode`

**Decisione:** Lo schema `.specialist.yaml` e' un superset. Nuovo campo `execution.mode: tool | skill | auto`.

**Impatto sul PRD Agent Forge:**
- Aggiungere il campo `execution.mode` alla documentazione dello specialist YAML
- **tool:** invocazione discreta (CLI call, attende risposta)
- **skill:** il `prompt.system` dello specialist viene iniettato nel contesto dell'agente (CLAUDE.md). Nessuna chiamata backend. Agent Forge GIA' fa questo quando scrive il system prompt in `.agent-forge/sessions/{uuid}/CLAUDE.md` al momento dello spawn -- va documentato come "skill mode implicito"
- **auto (raccomandato):** il sistema decide. Se sessione interattiva (tmux) -> skill mode. Se invocazione programmatica (MCP) -> tool mode
- Agent Forge deve ignorare campi che non usa ma mai rigettarli. Il PRD deve specificare questa policy esplicitamente

### A.5 Discovery: cross-scanning tra directory

**Decisione:** Entrambi i sistemi scansionano sia `.claude/specialists/` che `.agent-forge/specialists/`.

**Impatto sul PRD Agent Forge:**
- Il PRD deve specificare che Agent Forge scansiona ANCHE `.claude/specialists/` se presente
- Ordine di priorita': project > user > system (non cambia)
- Uno specialist messo in `.claude/specialists/` viene trovato anche da Agent Forge, e viceversa
- Il PRD deve documentare esplicitamente questa cross-compatibility

### A.6 Specialist lifecycle hooks: schema condiviso, sink SQLite

**Decisione:** 4 hook points (pre_render, post_render, pre_execute, post_execute) con schema eventi condiviso.

**Impatto sul PRD Agent Forge:**
- Aggiungere una sezione sui specialist lifecycle hooks
- Agent Forge scrive in SQLite (`specialist_events` table) + JSONL mirror (`.agent-forge/trace.jsonl`)
- Lo schema SQL:
```sql
CREATE TABLE specialist_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  invocation_id   TEXT NOT NULL,
  hook            TEXT NOT NULL CHECK(hook IN (
    'pre_render','post_render','pre_execute','post_execute')),
  timestamp       DATETIME NOT NULL,
  specialist_name TEXT NOT NULL,
  specialist_version TEXT,
  session_id      TEXT,          -- links to sessions table
  thread_id       TEXT,          -- links to messages.thread_id
  payload         TEXT NOT NULL,  -- Full event JSON
  backend         TEXT,
  duration_ms     INTEGER,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        REAL,
  status          TEXT,
  error_type      TEXT
);

CREATE INDEX idx_events_invocation ON specialist_events(invocation_id);
CREATE INDEX idx_events_specialist ON specialist_events(specialist_name, timestamp);
CREATE INDEX idx_events_session    ON specialist_events(session_id);
```
- Tutti gli eventi condividono un `invocation_id` (UUID) che correla i 4 hook di una singola invocazione
- I campi denormalizzati (backend, duration_ms, tokens_in/out, cost_usd) evitano di parsare il JSON payload nelle query di aggregazione
- Hook handlers estensibili e fire-and-forget (non bloccano la pipeline)

### A.7 Cost tracking: pricing table e aggregazione

**Decisione:** Ogni `post_execute` event calcola un `cost_estimate` basato su una pricing table configurabile.

**Impatto sul PRD Agent Forge:**
- Aggiungere la pricing table come configurazione:
```typescript
const MODEL_PRICING = {
  'glm-4':           { input: 0.05,  output: 0.10  },  // $/MTok
  'gemini-2.5-lite': { input: 0.075, output: 0.15  },
  'haiku':           { input: 0.40,  output: 2.00  },
  'gemini-pro':      { input: 1.25,  output: 5.00  },
  'sonnet':          { input: 3.00,  output: 15.00 },
  'opus':            { input: 15.00, output: 75.00 },
};
```
- Query di esempio per costo per specialist nelle ultime 24h:
```sql
SELECT specialist_name, SUM(cost_usd) as total_cost,
  COUNT(*) as invocations, AVG(duration_ms) as avg_latency
FROM specialist_events
WHERE hook = 'post_execute'
  AND timestamp > datetime('now', '-24 hours')
GROUP BY specialist_name ORDER BY total_cost DESC;
```
- Allinea con il cost-aware model selection gia' presente nel workflow Mercury

### A.8 Comunicazione: evoluzione futura verso SQLite-first

**Decisione:** Annotata come evoluzione futura (Agent Forge v1.3.0+). Il design attuale resta invariato.

**Impatto sul PRD Agent Forge -- sezione "Future / Roadmap":**
- Annotare il principio architetturale: tmux = execution layer, SQLite = communication layer
- Obiettivo futuro: gli agenti non comunicano mai leggendo il terminale dell'altro. Tutta la comunicazione strutturata passa per SQLite
- Mezzo: un Local Communication MCP server leggero (analogo a mercury-local) che wrappa `state.db`:
```typescript
// Future: MCP tools del local communication server
send_message({ to, type, content, payload?, priority? })
read_inbox({ session_id, unread_only?, type_filter? })
update_status({ session_id, status, last_activity? })
report_completion({ session_id, af_status, artifacts? })
get_task({ session_id })
```
- Ogni CLI agent userebbe i suoi hook nativi per chiamare questo MCP server:
  - Claude Code: PostToolUse hook -> update last_activity; Stop hook -> write worker_done
  - Gemini CLI: SDK lifecycle events (da studiare)
  - Qwen/GLM CLI: possibile wrapper approach
- Conseguenza: `capture-pane` viene demosso da canale di comunicazione primario a tool di debug/backup. `pipe-pane` resta come audit trail
- **Prerequisito:** studio del sistema di hook di ciascun CLI agent (Claude Code ha 8 hook types documentati; Gemini/Qwen/GLM da investigare)
- **Timeline:** Agent Forge v1.3.0+

### A.9 Schema conformance: Zod autoritativo

**Decisione:** Zod e' l'implementazione autoritativa. Se divergenza tra Zod e Pydantic, Pydantic si adatta.

**Impatto sul PRD Agent Forge:**
- Confermare che Agent Forge usa Zod per la validazione degli specialist
- Specificare che il Zod schema e' il canonical reference
- Nessun test suite automatico cross-linguaggio -- la conformance e' mantenuta manualmente tramite documentazione

### A.10 MCP nel contesto dell'orchestrazione multi-agente

**Discussione:** Il ruolo di MCP sta cambiando nell'industria. Claude Code ha introdotto skills e hooks come primitive native. Context injection (skills/CLAUDE.md/.cursorrules) e' sempre piu' preferito ai tool calls per dare conoscenza agli agenti. Per orchestrazione multi-agente, i pattern emergenti sono: CLI subprocesses, file-based communication, protocol-level handoff (tmux, SQLite mail). MCP resta eccellente come interfaccia uomo-macchina o tool-macchina, ma per agent-to-agent orchestration aggiunge overhead senza dare valore rispetto a metodi piu' diretti.

**Impatto sul PRD Agent Forge:**
- Considerare di documentare esplicitamente il ruolo di MCP nell'architettura: MCP e' l'interfaccia con cui il "boss" (Claude) delega lavoro, NON il canale di comunicazione inter-agente
- Il Specialist System non dipende da MCP -- funziona identicamente come MCP tool (unitAI), CLI command (Agent Forge), import Python (darth_feedor), o context injection (skill mode)
- Il campo `execution.mode: auto` permette allo stesso specialist di funzionare sia come tool call che come skill injection a seconda del contesto

---

## B. Decisioni che impattano Mercury Terminal Workflow

### B.1 Runtime: Bun/TS allineato

**Impatto:** Se il frontend/orchestratore Mercury e' TS, confermare Bun/TS. I microservizi Python restano Python. `bun:sqlite` per mercury.db.

### B.2 Specialist YAML: campo `prompt.normalize_template` e' Mercury-specifico

**Decisione:** Il campo `prompt.normalize_template` esiste nello schema superset ed e' usato solo da Mercury (Python/darth_feedor). unitAI e Agent Forge lo ignorano.

**Impatto:** Mercury deve documentare questo campo nel suo workflow spec come campo di cui ha ownership esclusiva.

### B.3 Dual-database architecture confermata

**Decisione confermata:**
- `agent-forge/state.db` (bun:sqlite): session liveness, parentage, messages -- owned by Agent Forge
- `mercury.db` (bun:sqlite): cognitive context, memory, artifacts, preferences -- owned by Mercury
- Correlazione via `task_ref` UUID condiviso nei payload messaggi Agent Forge e nei campi artifact Mercury

**Impatto:** Il workflow Mercury deve documentare esplicitamente che non scrive MAI in `state.db` direttamente; usa Agent Forge come intermediario.

### B.4 Mercury domain specialists: ownership e percorso

**Decisione:** I mercury-strategy-* specialists vivono in `.agent-forge/specialists/` del progetto Mercury. Non sono bundled con unitAI ma funzionano se unitAI gira nella stessa codebase.

**Impatto:** Il workflow Mercury deve specificare i path esatti dei suoi specialist YAML e confermare che seguono lo schema superset.

### B.5 Cost hierarchy allineata con hook system

**Decisione:** La pricing table del cost tracking (sezione A.7) si allinea con la cost hierarchy gia' definita da Mercury (GLM $0.05 -> Opus $15/MTok).

**Impatto:** Mercury puo' usare la stessa tabella del cost tracking per il suo cost-aware model selection. I dati vengono dalla tabella `specialist_events` via Agent Forge.

### B.6 MCP limit < 10

**Questione aperta:** Mercury enforza < 10 MCP attivi per sessione. Questo e' Mercury-specifico o va esteso all'ecosistema?

**Impatto:** Il workflow Mercury deve documentare questo vincolo come policy Mercury-only, non come vincolo di Agent Forge o unitAI.

---

## C. Decisioni condivise: azioni su ENTRAMBI i PRD

### C.1 @jaggerxtrm/specialist-loader come pacchetto condiviso futuro

Contenuto da estrarre:
- Zod schema definitions (superset)
- Discovery logic (3-scope, cross-scanning .claude/ + .agent-forge/)
- Template engine ($variable substitution)
- AF_STATUS parser
- Output validator (JSON Schema)
- Staleness detector (files_to_watch + threshold)
- Specialist lifecycle hook emitter

**Entrambi i PRD** devono menzionare questo pacchetto futuro e la timeline di estrazione.

### C.2 Policy "never reject unknown fields"

**Entrambi i PRD** devono specificare che il loro loader YAML accetta tutti i campi del superset schema senza errore, anche se non li usa. Questo garantisce che uno specialist scritto per un sistema funziona in tutti gli altri.

### C.3 Staleness detection: algoritmo condiviso

L'algoritmo e' identico ovunque:
1. Controlla se files in `validation.files_to_watch` hanno mtime > `metadata.updated`
2. Controlla se giorni da ultimo update > `validation.stale_threshold_days`
3. Stato: OK / STALE / AGED

**Entrambi i PRD** devono documentare questo algoritmo nella stessa forma.

### C.4 3-state circuit breaker interface

L'interfaccia del circuit breaker e' condivisa (vedi A.2). Agent Forge aggiunge la git-diff extension. Ma l'interfaccia base (CLOSED/HALF_OPEN/OPEN, fallback chain) e' la stessa.

---

## D. Checklist per l'agente Claude Code

Per ogni PRD, l'agente dovrebbe:

### Agent Forge PRD:
- [ ] Aggiornare runtime da Node/TS a Bun/TS dove menizionato
- [ ] Sostituire `better-sqlite3` con `bun:sqlite`
- [ ] Documentare circuit breaker a 3 stati (se non gia' presente)
- [ ] Confermare AF_STATUS come contratto condiviso, non modificabile unilateralmente
- [ ] Aggiungere campo `execution.mode: tool | skill | auto` allo schema specialist
- [ ] Documentare cross-scanning discovery (scansiona anche `.claude/specialists/`)
- [ ] Aggiungere sezione specialist lifecycle hooks (4 hook points, schema eventi, tabella SQLite)
- [ ] Aggiungere sezione cost tracking (pricing table, aggregation queries)
- [ ] Annotare evoluzione futura: SQLite-first communication (sezione roadmap/future v1.3.0+)
- [ ] Specificare Zod come implementazione autoritativa dello schema
- [ ] Documentare policy "never reject unknown fields"
- [ ] Menzionare `@jaggerxtrm/specialist-loader` come pacchetto futuro condiviso
- [ ] Chiarire il ruolo di MCP: interfaccia boss-worker, non canale agent-to-agent

### Mercury Terminal Workflow:
- [ ] Confermare Bun/TS dove applicabile (TS layer)
- [ ] Documentare ownership di `prompt.normalize_template`
- [ ] Confermare dual-database architecture (no scritture dirette in state.db)
- [ ] Specificare path dei mercury-strategy-* specialists
- [ ] Allineare cost hierarchy con la pricing table condivisa
- [ ] Documentare MCP limit < 10 come policy Mercury-only
- [ ] Menzionare `@jaggerxtrm/specialist-loader` come dipendenza futura

---

*Documento generato dalla sessione di design unitAI v2 + Ecosystem Alignment, Marzo 2026.*