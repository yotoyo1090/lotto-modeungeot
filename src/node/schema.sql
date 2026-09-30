-- Le schéma. Lu et appliqué par src/node/db.js.
--
-- Principe : ce que la base peut refuser, elle le refuse. L'ancienne
-- plateforme n'avait pas une seule contrainte — d'où les `filter().exists()`
-- partout pour compenser à la main, et les doublons possibles. Ici, un
-- tirage mal formé ne peut pas entrer, même par erreur de programmation.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- Lotto 6/45

CREATE TABLE IF NOT EXISTS draws (
    rang    INTEGER PRIMARY KEY,          -- 회차, unique par construction
    date    TEXT    NOT NULL,             -- ISO 8601
    n1      INTEGER NOT NULL,
    n2      INTEGER NOT NULL,
    n3      INTEGER NOT NULL,
    n4      INTEGER NOT NULL,
    n5      INTEGER NOT NULL,
    n6      INTEGER NOT NULL,
    bonus   INTEGER NOT NULL,

    CHECK (rang > 0),
    CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

    -- Bornes
    CHECK (n1 BETWEEN 1 AND 45), CHECK (n2 BETWEEN 1 AND 45),
    CHECK (n3 BETWEEN 1 AND 45), CHECK (n4 BETWEEN 1 AND 45),
    CHECK (n5 BETWEEN 1 AND 45), CHECK (n6 BETWEEN 1 AND 45),
    CHECK (bonus BETWEEN 1 AND 45),

    -- Strictement croissants : trie ET interdit les doublons d'un coup.
    CHECK (n1 < n2 AND n2 < n3 AND n3 < n4 AND n4 < n5 AND n5 < n6),

    -- Le bonus n'est jamais l'un des six.
    CHECK (bonus NOT IN (n1, n2, n3, n4, n5, n6))
);

CREATE TABLE IF NOT EXISTS prizes (
    rang    INTEGER NOT NULL REFERENCES draws(rang) ON DELETE CASCADE,
    rank    INTEGER NOT NULL,             -- 1등 … 5등
    winners INTEGER,                      -- 당첨자수
    amount  INTEGER,                      -- 당첨금액, en won

    PRIMARY KEY (rang, rank),
    CHECK (rank BETWEEN 1 AND 5),
    CHECK (winners IS NULL OR winners >= 0),
    CHECK (amount  IS NULL OR amount  >= 0)
) WITHOUT ROWID;

-- 비고 : ['1등', '자동8', '수동4', '반자동2']. Une table plutôt qu'une
-- chaîne, pour que « combien de tirages avec 자동8 » reste une requête.
CREATE TABLE IF NOT EXISTS draw_notes (
    rang     INTEGER NOT NULL REFERENCES draws(rang) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    note     TEXT    NOT NULL,
    PRIMARY KEY (rang, position)
) WITHOUT ROWID;

-- 추첨기 : quelle machine 비너스 (1호기 · 2호기 · 3호기) a tiré ce 회차.
-- L'information n'existe dans aucune donnée officielle — elle se lit sur la
-- retransmission — donc la table est remplie par `tools/import-hogi.js`,
-- pas par le crawler. Une ligne par 회차 étiqueté, à partir du 262회.
CREATE TABLE IF NOT EXISTS machines (
    rang    INTEGER PRIMARY KEY REFERENCES draws(rang) ON DELETE CASCADE,
    machine INTEGER NOT NULL,
    CHECK (machine BETWEEN 1 AND 3)
) WITHOUT ROWID;

-- 공나온 순서 : les six boules dans l'ordre où elles sont tombées. La base
-- ne connaît que le tirage trié ; ceci est l'information que le tri efface.
-- Remplie par `crawl.js order` (site tiers, depuis le 468회), jamais par le
-- crawler officiel qui ne la possède pas. Triées, o1…o6 = n1…n6 de draws.
CREATE TABLE IF NOT EXISTS ball_order (
    rang INTEGER PRIMARY KEY REFERENCES draws(rang) ON DELETE CASCADE,
    o1 INTEGER NOT NULL, o2 INTEGER NOT NULL, o3 INTEGER NOT NULL,
    o4 INTEGER NOT NULL, o5 INTEGER NOT NULL, o6 INTEGER NOT NULL
) WITHOUT ROWID;

-- 1등 당첨자의 선택 방식 : 자동 · 수동 · 반자동. Le site officiel les publie
-- dans la même réponse JSON que le tirage. Les 자동 ne dépendent pas des
-- numéros ; les 수동 mesurent la popularité de la grille sortie — c'est la
-- matière première d'un 분배 지표 sans dilution. auto+manual+semi = prizes.winners (1등).
CREATE TABLE IF NOT EXISTS win_types (
    rang   INTEGER PRIMARY KEY REFERENCES draws(rang) ON DELETE CASCADE,
    auto   INTEGER NOT NULL CHECK (auto >= 0),
    manual INTEGER NOT NULL CHECK (manual >= 0),
    semi   INTEGER NOT NULL CHECK (semi >= 0)
) WITHOUT ROWID;

-- ------------------------------------------------------------- 내 조합
--
-- Les grilles qu'on a décidé de jouer, et le 회차 pour lequel on les a
-- faites. C'est ce qui permet à la base de répondre toute seule, le samedi
-- soir venu, à « qu'est-ce que mes grilles ont donné ».
--
-- `sharing` fige l'indice 분배 au moment où la grille a été retenue : le
-- modèle peut être recalibré plus tard, et on veut pouvoir relire le choix
-- tel qu'il a été fait, pas tel qu'on le referait aujourd'hui.
--
-- La clé unique porte sur (lot, 회차, six numéros) : rejouer l'import ne
-- crée pas de doublon, exactement comme `putDraws`.
CREATE TABLE IF NOT EXISTS grids (
    id      INTEGER PRIMARY KEY,
    lot     TEXT    NOT NULL,          -- le lot d'où elle sort
    target  INTEGER NOT NULL,          -- le 회차 visé
    n1      INTEGER NOT NULL,
    n2      INTEGER NOT NULL,
    n3      INTEGER NOT NULL,
    n4      INTEGER NOT NULL,
    n5      INTEGER NOT NULL,
    n6      INTEGER NOT NULL,
    sharing REAL,                      -- 분배 지표 au moment du choix
    source  TEXT,                      -- 일반조합 / 자동조합 / 수동조합 / …
    note    TEXT,
    saved_at TEXT   NOT NULL,

    CHECK (target > 0),
    CHECK (n1 BETWEEN 1 AND 45), CHECK (n2 BETWEEN 1 AND 45),
    CHECK (n3 BETWEEN 1 AND 45), CHECK (n4 BETWEEN 1 AND 45),
    CHECK (n5 BETWEEN 1 AND 45), CHECK (n6 BETWEEN 1 AND 45),
    CHECK (n1 < n2 AND n2 < n3 AND n3 < n4 AND n4 < n5 AND n5 < n6),
    CHECK (sharing IS NULL OR sharing > 0),
    CHECK (saved_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*'),

    UNIQUE (lot, target, n1, n2, n3, n4, n5, n6)
);

CREATE INDEX IF NOT EXISTS grids_target ON grids(target);

-- ------------------------------------------------------------ 연금복권 720+

CREATE TABLE IF NOT EXISTS pension (
    rang  INTEGER PRIMARY KEY,
    date  TEXT,
    grp   INTEGER NOT NULL,               -- 조, de 1 à 5
    d1 INTEGER NOT NULL, d2 INTEGER NOT NULL, d3 INTEGER NOT NULL,
    d4 INTEGER NOT NULL, d5 INTEGER NOT NULL, d6 INTEGER NOT NULL,
    b1 INTEGER NOT NULL, b2 INTEGER NOT NULL, b3 INTEGER NOT NULL,
    b4 INTEGER NOT NULL, b5 INTEGER NOT NULL, b6 INTEGER NOT NULL,

    CHECK (rang > 0),
    CHECK (date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CHECK (grp BETWEEN 1 AND 5),

    -- Ici les chiffres se répètent et leur position compte : pas de
    -- contrainte d'ordre, seulement les bornes.
    CHECK (d1 BETWEEN 0 AND 9), CHECK (d2 BETWEEN 0 AND 9),
    CHECK (d3 BETWEEN 0 AND 9), CHECK (d4 BETWEEN 0 AND 9),
    CHECK (d5 BETWEEN 0 AND 9), CHECK (d6 BETWEEN 0 AND 9),
    CHECK (b1 BETWEEN 0 AND 9), CHECK (b2 BETWEEN 0 AND 9),
    CHECK (b3 BETWEEN 0 AND 9), CHECK (b4 BETWEEN 0 AND 9),
    CHECK (b5 BETWEEN 0 AND 9), CHECK (b6 BETWEEN 0 AND 9)
);

-- ------------------------------------------------------------------ Journal

-- Ce que le crawler a fait, et quand. Une panne silencieuse devient
-- visible : `doctor` lit cette table.
CREATE TABLE IF NOT EXISTS crawl_log (
    id       INTEGER PRIMARY KEY,
    at       TEXT    NOT NULL,
    product  TEXT    NOT NULL,
    mode     TEXT    NOT NULL,
    added    INTEGER NOT NULL DEFAULT 0,
    updated  INTEGER NOT NULL DEFAULT 0,
    rejected INTEGER NOT NULL DEFAULT 0,
    failed   INTEGER NOT NULL DEFAULT 0,
    detail   TEXT,
    CHECK (product IN ('lotto', 'pension')),
    CHECK (at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
);

CREATE INDEX IF NOT EXISTS crawl_log_at ON crawl_log(at DESC, id DESC);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;

-- ------------------------------------------------------------------- Vues
--
-- Elles n'ajoutent pas de données : elles rendent le SQL lisible. Compter
-- les sorties du 7 devient une ligne au lieu de six OR. C'est surtout ce
-- qui rend l'outil `sql()` du MCP réellement utilisable.

CREATE VIEW IF NOT EXISTS draw_numbers AS
    SELECT rang, 1 AS position, n1 AS number FROM draws
    UNION ALL SELECT rang, 2, n2 FROM draws
    UNION ALL SELECT rang, 3, n3 FROM draws
    UNION ALL SELECT rang, 4, n4 FROM draws
    UNION ALL SELECT rang, 5, n5 FROM draws
    UNION ALL SELECT rang, 6, n6 FROM draws
    UNION ALL SELECT rang, 7, bonus FROM draws;   -- position 7 = 보너스

-- Ce que chaque grille a attrapé. La vue **compte** seulement : combien de
-- numéros coïncident, et si le bonus y est. Le rang — 1등 … 5등 — n'est pas
-- calculé ici : ces règles vivent dans `core/combos.js` et nulle part
-- ailleurs. Deux définitions du 2등 finiraient par diverger.
--
-- `drawn = 0` : le 회차 visé n'est pas encore tiré. Les grilles y sont donc
-- en attente, pas perdantes.
CREATE VIEW IF NOT EXISTS grid_hits AS
    SELECT g.id, g.lot, g.target, g.sharing, g.source, g.note, g.saved_at,
           g.n1, g.n2, g.n3, g.n4, g.n5, g.n6,
           d.rang IS NOT NULL AS drawn,
           d.date AS draw_date,
           (CASE WHEN g.n1 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
         + (CASE WHEN g.n2 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
         + (CASE WHEN g.n3 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
         + (CASE WHEN g.n4 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
         + (CASE WHEN g.n5 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
         + (CASE WHEN g.n6 IN (d.n1,d.n2,d.n3,d.n4,d.n5,d.n6) THEN 1 ELSE 0 END)
           AS matched,
           CASE WHEN d.bonus IN (g.n1,g.n2,g.n3,g.n4,g.n5,g.n6) THEN 1 ELSE 0 END
           AS bonus
    FROM grids g
    LEFT JOIN draws d ON d.rang = g.target;

CREATE VIEW IF NOT EXISTS pension_digits AS
    SELECT rang, 'digits' AS source, 1 AS position, d1 AS digit FROM pension
    UNION ALL SELECT rang, 'digits', 2, d2 FROM pension
    UNION ALL SELECT rang, 'digits', 3, d3 FROM pension
    UNION ALL SELECT rang, 'digits', 4, d4 FROM pension
    UNION ALL SELECT rang, 'digits', 5, d5 FROM pension
    UNION ALL SELECT rang, 'digits', 6, d6 FROM pension
    UNION ALL SELECT rang, 'bonus',  1, b1 FROM pension
    UNION ALL SELECT rang, 'bonus',  2, b2 FROM pension
    UNION ALL SELECT rang, 'bonus',  3, b3 FROM pension
    UNION ALL SELECT rang, 'bonus',  4, b4 FROM pension
    UNION ALL SELECT rang, 'bonus',  5, b5 FROM pension
    UNION ALL SELECT rang, 'bonus',  6, b6 FROM pension;
