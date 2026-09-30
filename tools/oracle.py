#!/usr/bin/env python3
"""L'oracle du 자동조합 : l'ancien algorithme, transcrit et exécutable.

Ce fichier est une **transcription** de `combinaison/views.py` L497–802 de
l'ancien projet Django, sortie de Django. Même boucle `itertools.combinations`,
mêmes fonctions de filtre, même ordre, mêmes conventions bizarres — y compris
le `< 23` du 저고 et le `sorted()` du vivier.

Il ne sert qu'à une chose : produire la vérité contre laquelle le générateur
JavaScript est mesuré. C'est important qu'il soit *bête* — il énumère les
C(n, 6) combinaisons une par une, sans élagage, là où le JS coupe des
sous-arbres entiers. Deux algorithmes différents qui tombent d'accord sur
des centaines de milliers de grilles, ce n'est pas une coïncidence ; le même
algorithme écrit deux fois ne prouverait rien.

Les deux câblages des filtres 배수 / 합성수 sont produits :

  legacy  le décalage d'un cran de l'ancien site (L796–800)
  fixed   ce que disent les étiquettes

    python3 tools/oracle.py [--db chemin] [--out test/fixtures/oracle.json]
"""

import argparse
import hashlib
import json
import sqlite3
import sys
from collections import Counter
from itertools import combinations
from pathlib import Path

NMAX = 45
PICK = 6

SOSU = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]
COMPOSITE = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28,
             30, 32, 33, 34, 35, 36, 38, 39, 40, 42, 44, 45]
DEUX = list(range(2, NMAX + 1, 2))
TROIS = list(range(3, NMAX + 1, 3))
QUATRE = list(range(4, NMAX + 1, 4))
CINQ = list(range(5, NMAX + 1, 5))

PRESETS = {
    'all': list(range(1, NMAX + 1)),
    'mult2': DEUX,
    'mult3': TROIS,
    'mult4': QUATRE,
    'mult5': CINQ,
    'composites': COMPOSITE,
    'primes': SOSU,
}

SECTION_MAP = {
    1: list(range(1, 10)),
    10: list(range(10, 20)),
    20: list(range(20, 30)),
    30: list(range(30, 40)),
    40: list(range(40, 46)),
}

# Les cinq filtres de comptage, et la liste que chacun compte.
# `legacy` reproduit le décalage de L796-800 ; `fixed` fait ce que dit
# l'étiquette. Le 소수 n'a jamais été décalé et ne figure donc pas ici.
WIRINGS = {
    'legacy': {
        'composites': DEUX,
        'mult2': TROIS,
        'mult3': QUATRE,
        'mult4': CINQ,
        'mult5': COMPOSITE,
    },
    'fixed': {
        'composites': COMPOSITE,
        'mult2': DEUX,
        'mult3': TROIS,
        'mult4': QUATRE,
        'mult5': CINQ,
    },
}


def load_draws(path):
    """Les tirages, 회차 → les sept numéros dans l'ordre 일…보너스."""
    db = sqlite3.connect(path)
    rows = db.execute(
        'SELECT 회차, 일, 이, 삼, 사, 오, 육, 보너스 '
        'FROM accountadmin_lottobasedata'
    ).fetchall()
    db.close()
    return {int(r[0]): tuple(int(x) for x in r[1:]) for r in rows}


def build_pool(case):
    """Vivier : liste choisie, + 추가번호, − 제외번호, − 제외구간.

    L'ordre est celui de l'original (L497-541) et il compte : ajouter un
    numéro puis retirer sa dizaine ne laisse pas le numéro.
    """
    numbers = list(PRESETS[case.get('preset', 'all')])

    add = [int(n) for n in case.get('add', [])]
    if add:
        numbers = sorted(set(numbers + add))

    remove = [int(n) for n in case.get('remove', [])]
    if remove:
        numbers = [x for x in numbers if x not in remove]

    sections = [int(s) for s in case.get('sections', [])]
    if sections:
        drop = []
        for s in sections:
            drop.extend(SECTION_MAP[s])
        numbers = [x for x in numbers if x not in drop]

    return numbers


def head_sum(combo):
    """앞자리수합 — le premier chiffre décimal de chaque numéro."""
    return sum(int(str(n)[0]) for n in combo)


def tail_sum(combo):
    """끝자리수합 — le dernier. Sous 10, c'est le même chiffre."""
    return sum(int(str(n)[0] if n < 10 else str(n)[1]) for n in combo)


def ac_value(combo):
    pairs = list(combinations(combo, 2))
    return len({abs(a - b) for a, b in pairs}) - (len(combo) - 1)


def low_count(combo):
    # `num < 23` dans l'original — donc 저 = 1..22. La liste 저번호 juste
    # en dessous utilisait `<= 23`, mais c'est ce compte-ci qui fabrique
    # l'étiquette, et c'est l'étiquette qui est filtrée.
    return len([n for n in combo if n < 23])


def odd_count(combo):
    return sum(1 for n in combo if n % 2 != 0)


def carry_count(combo, previous):
    """이월 — combien des six retombent sur les SEPT du 회차 précédent."""
    if previous is None:
        return 0
    return len(set(combo) & set(previous))


def run(case, draws, wiring):
    """Énumère, bêtement, et rend les grilles retenues."""
    pool = build_pool(case)

    fixed = sorted({int(n) for n in case.get('fix', [])})
    for n in fixed:
        if n not in pool:
            # L'original retire les 고정수 du vivier sans vérifier qu'ils y
            # étaient : un 고정수 exclu donnait une grille impossible.
            # On s'arrête plutôt que de produire une référence absurde.
            raise ValueError(f'고정수 {n} absent du vivier')
    rest = [x for x in pool if x not in fixed]

    counts = WIRINGS[wiring]
    checked = case.get('counts', {})

    total = case.get('total')            # [début, fin] ou None
    ac = case.get('ac')                  # liste de valeurs ou None
    low = case.get('low')                # liste de comptes 저
    odd = case.get('odd')                # liste de comptes 홀
    front = case.get('front')            # liste de sommes 앞자리수
    back = case.get('back')              # liste de sommes 끝자리수
    carry = case.get('carry')            # liste de comptes 이월
    primes = checked.get('primes')

    rang = case.get('rang')
    previous = draws.get(int(rang) - 1) if rang else None

    kept = []
    for combo in combinations(rest, PICK - len(fixed)):
        grid = sorted(fixed + list(combo))

        if total is not None:
            s = sum(grid)
            if s < total[0] or s > total[1]:
                continue
        if carry is not None and carry_count(grid, previous) not in carry:
            continue
        if ac is not None and ac_value(grid) not in ac:
            continue
        if low is not None and low_count(grid) not in low:
            continue
        if odd is not None and odd_count(grid) not in odd:
            continue
        if front is not None and head_sum(grid) not in front:
            continue
        if back is not None and tail_sum(grid) not in back:
            continue
        if primes is not None and len([n for n in grid if n in SOSU]) not in primes:
            continue

        failed = False
        for field, wanted in checked.items():
            if field == 'primes':
                continue
            listcheck = counts[field]
            if len([n for n in grid if n in listcheck]) not in wanted:
                failed = True
                break
        if failed:
            continue

        kept.append(grid)

    return kept


def digest(grids):
    """Une empreinte de l'ENSEMBLE des grilles, l'ordre mis à plat.

    L'ordre d'énumération des deux implémentations ne coïncide pas dès
    qu'il y a un 고정수 : l'original énumère le reste puis trie chaque
    grille, donc un 고정수 qui n'est pas le plus petit se glisse au milieu
    et casse l'ordre lexicographique. Le JavaScript, lui, parcourt le
    vivier entier. Les deux retiennent les mêmes grilles, pas dans le même
    ordre — c'est l'ensemble qu'on compare, et on trie avant d'empreindre
    pour que la comparaison porte sur ce qui compte.
    """
    h = hashlib.sha256()
    for g in sorted(grids):
        h.update(bytes(g))
    return h.hexdigest()


# Les cas. Chacun vise un filtre, sur un vivier assez petit pour que
# l'énumération naïve tienne en quelques secondes — c'est justement parce
# qu'elle est naïve qu'elle fait autorité.
CASES = [
    {'name': '소수 vivier, aucun filtre', 'preset': 'primes'},
    {'name': '오의배수 vivier, aucun filtre', 'preset': 'mult5'},
    {'name': '총합 seul', 'preset': 'primes', 'total': [80, 120]},
    {'name': 'AC en ensemble disjoint', 'preset': 'mult3', 'ac': [6, 10]},
    {'name': '저고 en deux valeurs', 'preset': 'mult3', 'low': [2, 4]},
    {'name': '홀짝 en une valeur', 'preset': 'mult2', 'odd': [0]},
    {'name': '앞자리수합', 'preset': 'mult4', 'front': [10, 15, 20]},
    {'name': '끝자리수합', 'preset': 'mult4', 'back': [20, 25]},
    {'name': '소수숫자수', 'preset': 'all', 'sections': [20, 30, 40],
     'counts': {'primes': [2, 3]}},
    {'name': '고정수 3개', 'preset': 'primes', 'fix': [2, 3, 41]},
    {'name': '고정수 hors du début', 'preset': 'primes', 'fix': [41]},
    {'name': '고정수 + 총합', 'preset': 'mult3', 'fix': [3, 45], 'total': [100, 150]},
    {'name': '추가번호 et 제외번호', 'preset': 'primes',
     'add': [1, 4, 6], 'remove': [2, 3]},
    {'name': '제외구간 trois dizaines', 'preset': 'all',
     'sections': [1, 10, 20], 'total': [230, 250]},
    {'name': '이월 sur 1134회', 'preset': 'mult3', 'rang': 1134, 'carry': [0, 1]},
    {'name': '이월 = 2 sur 1100회', 'preset': 'all', 'sections': [30, 40],
     'rang': 1100, 'carry': [2]},
    {'name': '합성수숫자수 — le filtre décalé', 'preset': 'all',
     'sections': [20, 30, 40], 'counts': {'composites': [3, 4]}},
    {'name': '이의배수숫자수 — décalé aussi', 'preset': 'all',
     'sections': [20, 30, 40], 'counts': {'mult2': [2]}},
    {'name': '삼의배수숫자수', 'preset': 'all',
     'sections': [20, 30, 40], 'counts': {'mult3': [2]}},
    {'name': '사의배수숫자수', 'preset': 'all',
     'sections': [20, 30, 40], 'counts': {'mult4': [1]}},
    {'name': '오의배수숫자수 — retombe sur les composés', 'preset': 'all',
     'sections': [20, 30, 40], 'counts': {'mult5': [1]}},
    {'name': 'les cinq comptages ensemble', 'preset': 'all',
     'sections': [20, 30, 40],
     'counts': {'composites': [2, 3, 4], 'mult2': [2, 3, 4], 'mult3': [1, 2],
                'mult4': [0, 1, 2], 'mult5': [0, 1, 2]}},
    {'name': 'tout à la fois', 'preset': 'all', 'sections': [1],
     'rang': 1134, 'total': [120, 180], 'ac': [7, 8, 9], 'low': [1, 2],
     'odd': [2, 3, 4], 'carry': [0], 'counts': {'primes': [1, 2]}},
]

FULL_LIMIT = 3000     # au-delà, on garde le compte et l'empreinte


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='/root/core/db.sqlite3')
    parser.add_argument('--out', default='test/fixtures/oracle.json')
    args = parser.parse_args()

    if not Path(args.db).exists():
        print(f'{args.db} introuvable', file=sys.stderr)
        return 1

    draws = load_draws(args.db)
    print(f'{len(draws)} tirages lus depuis {args.db}')

    out = {'source': 'combinaison/views.py L497-802, transcrit',
           'draws': len(draws), 'cases': []}

    for case in CASES:
        entry = {k: v for k, v in case.items()}
        entry['pool'] = build_pool(case)
        entry['results'] = {}
        for wiring in ('legacy', 'fixed'):
            grids = run(case, draws, wiring)
            result = {'count': len(grids), 'digest': digest(grids)}
            if len(grids) <= FULL_LIMIT:
                result['grids'] = grids
            entry['results'][wiring] = result
        a = entry['results']['legacy']['count']
        b = entry['results']['fixed']['count']
        mark = '  ← les deux câblages divergent' if a != b else ''
        print(f"  {case['name']:<42} legacy {a:>7}  fixed {b:>7}{mark}")
        out['cases'].append(entry)

    # Les tirages cités par un cas, pour que le test JS travaille sur les
    # mêmes sans avoir besoin de l'ancienne base.
    out['draws_used'] = {
        str(r): list(draws[r])
        for case in CASES if case.get('rang')
        for r in (int(case['rang']), int(case['rang']) - 1)
        if r in draws
    }

    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    size = path.stat().st_size / 1024
    print(f'\n{len(CASES)} cas écrits dans {args.out} ({size:.0f} Ko)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
