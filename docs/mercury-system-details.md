
# Mercury Terminal — Interfaccia

## 1. Shell di avvio e navigazione principale

Mercury Terminal è wrappato in un'interfaccia Bun/TypeScript che si avvia come layer sopra tmux. La splash screen mostra il render della faccia Mercury (stesso asset del website) con logo, e da lì si accede alle opzioni principali:

- Avvio di Claude Code (sessione interattiva diretta)
- Avvio del [[workflow-agentico-front-agent-italiano]] completo con tutte le sue funzioni
- Menu di gestione delle sessioni parallele attive

L'interfaccia è costruita su tmux: è sempre possibile fare detach e tornare alla splash screen senza perdere nulla. Il look è professionale, senza fronzoli. Ispirazione diretta da `agent-forge`.

---

## 2. Sessioni agente e persistenza

Le sessioni tmux sono la primitiva centrale. Ogni sessione rappresenta un agente o un contesto di lavoro, e persiste tramite il sistema SQLite definito in [[agent-forge]].

Un agente può interpellare un'altra sessione tmux attiva — questo abilita workflow multi-agentici asincroni: si avvia una ricerca parallela, si continua su un altro fronte, poi si torna e si chiede al front agent di leggere l'output dell'altro e sintetizzare. Le sessioni possono essere identificate e ricaricate tramite ID sessione tmux + ID sessione CLI.

> **Domanda aperta:** la strategia del "posto di lavoro continuo" tramite agent-forge è compatibile con il qwen-service centralizzato? O è necessario pinnare le sessioni e caricarle on-demand per ID?

---

## 3. Visualizzazioni di mercato

Dal menu principale sono accessibili quoteboard dettagliate di tutti i mercati. Si può navigare per singolo ticker o per gruppo. Per ciascuno:

- Analisi real-time prodotte dal background worker
- Articoli e research paper summaries con sidebar
- Rolling context aggiornato
- Metriche di volatilità
- Correlation matrix

Queste visualizzazioni sono accessibili anche al front agent principale, che può interrogare il background worker come farebbe qualsiasi sessione tmux.

---

## 4. Barra di stato tmux

Quando una sessione chat è aperta, la status bar tmux (in fondo al terminale) espone:

- Identificatore dell'agente attivo
- Dati di mercato rilevanti selezionati

La barra è il punto di orientamento rapido senza dover uscire dalla sessione corrente.

---

## 5. Agenti specializzati — Strategy Suite

Gli agenti specializzati sono sessioni pre-configurate, avviate on-demand o in modo autonomo (modello simile a openclaw). Hanno accesso a MCP, skills specifiche, `github-grep`, e al database strategies [[mercury-strategies]]. Fanno cross-check su tutti i dati disponibili via Mercury.

### 5.1 Strategy Researcher
Riceve la richiesta dell'utente, fa ricerca, raccoglie e pulisce i dati per il Developer. Usa MCP, skills e le strategies Mercury come strumenti primari.

### 5.2 Strategy Developer
Riceve i dati preparati dal Researcher. Ha a disposizione script specifici per analisi e processing (dati quantitativi da ArcticDB, qualitativi da TBD). Può generare script programmaticamente — senza sovrascrivere mai i default (connettori DB, ecc.). Individua correlazioni tra eventi macroeconomici e movimenti di mercato.

> **Da definire:** quale DB per i dati qualitativi? Arctic vs SQLite per quale caso d'uso?

### 5.3 Strategy Documentor
Mantiene la documentazione aggiornata e coerente. Può essere invocato dagli altri agenti o girare in autonomia monitorando diff e cambiamenti locali. Nel processo di installazione viene anche creata la repo dell'utente su cui opera.

### 5.4 Strategy Backtester
Si occupa di backtesting e validazione dei risultati. È un set quantops dedicato.

---

## 6. Agente Supervisor (Orchestratore)

Spawna e coordina gli agenti della strategy suite. Interagisce con l'utente per affinare e pre-preparare le richieste prima di delegarle. Quando invocato direttamente, ha un set di comandi e skills specifici. Monitora periodicamente lo stato di avanzamento degli agenti — su richiesta o autonomamente — e li guida verso il completamento.

---

## 7. Database Mercury

| Database | Contenuto |
|---|---|
| `market-data` | Dati di mercato OHLCV, tick, ecc. |
| `darth_feedor` | Dati qualitativi: documenti istituzionali, newsletter, squawk |
| `treasury-fed` | Dati Fed, Treasury, tassi |
| `economic-data` | Dati macroeconomici |
| `economic-calendar` | Calendario eventi economici |

---

## Note collegate

- [[workflow-agentico-front-agent-italiano]] — idea corrente lato client
- [[agent-forge]] — sistema di workflow agentico generale, base tecnica di Mercury; si sviluppa dallo specialist system in `1-projects/omni/specialists-system`
- [[mercury-strategies]] — database delle strategie accessibile dagli agenti specializzati
