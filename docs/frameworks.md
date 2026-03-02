# overview
Per frameworks si intendono quei framework ritenuti industry standard per lo sviluppo, il mantenimento e il debug in sistemi sofisticati, moderni e ambienti produzione.
mi vengono in mente ad esempio il test driven development.
Questi framework possono essere eseguiti via skills OPPURE in modo più strict tramite gli specialisty.yaml - in questo caso il file contenente la definizione del framework viene iniettato come parte della pipeline/prompt ovvero:
    - agent avvia specialist
    - viene aggiunto promp dell'agent
    - infine viene iniettato il framework desiderato e impostato nel file .yaml direttamente
