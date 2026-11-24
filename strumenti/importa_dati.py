#!/usr/bin/env python3
"""Importa ricette e alimenti dai CSV di Excel (cartella archivio/) e scrive
data/alimenti.json e data/ricette.json per l'app.

Uso:  python3 strumenti/importa_dati.py

Qui sono raccolte tutte le correzioni decise nell'analisi (punti_aperti_v1_pwa):
- anagrafica alimenti pulita (duplicati uniti, reparti Esselunga, fresco/dispensa,
  confezioni, varianti surgelate del pesce);
- dosi sempre per UNA porzione (CEN01-30 divise per 2,5);
- contorno e frutta diventano ingredienti veri;
- categorie proteiche su lista chiusa;
- tempi di preparazione attiva e totale;
- ricette non adatte a un bimbo di 2 anni eliminate, orzo sostituito dal farro.
"""
import csv
import json
import math
import os
import sys

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCHIVIO = os.path.join(RADICE, "archivio")
DATI = os.path.join(RADICE, "data")

# ---------------------------------------------------------------------------
# Anagrafica alimenti
# reparto: verdure | frutta | banco_frigo | pasta | conserve | salumi_formaggi
#          | congelati | bevande | pane
# tipo: fresco (si compra per la settimana) | dispensa (controlla se manca)
# conf: dimensione della confezione nell'unità dell'alimento (facoltativa)
# surgelato: ID della variante surgelata (solo pesce)
# ---------------------------------------------------------------------------
A = lambda id, nome, reparto, tipo, unita, conf=None, confNome=None, surgelato=None: {
    k: v for k, v in dict(id=id, nome=nome, reparto=reparto, tipo=tipo, unita=unita,
                          conf=conf, confNome=confNome, surgelato=surgelato).items() if v is not None}

ALIMENTI = [
    A("AL01", "Pasta corta", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL02", "Riso Carnaroli", "pasta", "dispensa", "g", 1000, "pacco"),
    A("AL03", "Riso basmati", "pasta", "dispensa", "g", 1000, "pacco"),
    A("AL04", "Farro perlato", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL05", "Couscous", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL06", "Gnocchi di patate", "banco_frigo", "fresco", "g", 500, "confezione"),
    A("AL07", "Pastina", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL08", "Ceci precotti", "conserve", "dispensa", "g", 240, "lattina"),
    A("AL09", "Fagioli borlotti", "conserve", "dispensa", "g", 240, "lattina"),
    A("AL10", "Lenticchie in scatola", "conserve", "dispensa", "g", 240, "lattina"),
    A("AL11", "Lenticchie rosse decorticate", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL12", "Piselli surgelati", "congelati", "dispensa", "g", 450, "busta"),
    A("AL13", "Passata di pomodoro", "conserve", "dispensa", "g", 700, "bottiglia"),
    A("AL14", "Zucca", "verdure", "fresco", "g"),
    A("AL15", "Zucchine", "verdure", "fresco", "g"),
    A("AL16", "Carote", "verdure", "fresco", "g"),
    A("AL17", "Patate", "verdure", "fresco", "g"),
    A("AL18", "Spinaci", "verdure", "fresco", "g"),
    A("AL19", "Fagiolini", "verdure", "fresco", "g"),
    A("AL20", "Broccoli", "verdure", "fresco", "g"),
    A("AL21", "Pomodorini", "verdure", "fresco", "g"),
    A("AL22", "Mele", "frutta", "fresco", "pz"),
    A("AL23", "Banane", "frutta", "fresco", "pz"),
    A("AL24", "Frutta di stagione", "frutta", "fresco", "pz"),
    A("AL25", "Latte intero", "banco_frigo", "fresco", "ml", 1000, "bottiglia"),
    A("AL26", "Burro", "banco_frigo", "dispensa", "g", 250, "panetto"),
    A("AL27", "Parmigiano / Grana", "salumi_formaggi", "dispensa", "g"),
    A("AL28", "Ricotta", "banco_frigo", "fresco", "g", 250, "vaschetta"),
    A("AL29", "Robiola", "banco_frigo", "fresco", "g", 100, "confezione"),
    A("AL30", "Uova", "banco_frigo", "fresco", "pz", 6, "confezione"),
    A("AL31", "Macinato di tacchino", "banco_frigo", "fresco", "g"),
    A("AL32", "Macinato di manzo magro", "banco_frigo", "fresco", "g"),
    A("AL33", "Petto di pollo", "banco_frigo", "fresco", "g"),
    A("AL34", "Fesa di tacchino", "banco_frigo", "fresco", "g"),
    A("AL35", "Lonza di maiale", "banco_frigo", "fresco", "g"),
    A("AL36", "Fesa di vitello a fettine", "banco_frigo", "fresco", "g"),
    A("AL37", "Merluzzo filetti", "banco_frigo", "fresco", "g", surgelato="AL120"),
    A("AL38", "Platessa filetti", "banco_frigo", "fresco", "g", surgelato="AL121"),
    A("AL39", "Salmone trancio", "banco_frigo", "fresco", "g", surgelato="AL122"),
    A("AL40", "Tonno in scatola", "conserve", "dispensa", "g", 80, "scatoletta"),
    A("AL41", "Pangrattato", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL42", "Farina 00", "pasta", "dispensa", "g", 1000, "pacco"),
    A("AL43", "Pane a fette", "pane", "fresco", "g"),
    A("AL44", "Pasta sfoglia", "banco_frigo", "fresco", "pz", 1, "rotolo"),
    A("AL45", "Prosciutto cotto", "banco_frigo", "fresco", "g", 120, "vaschetta"),
    A("AL46", "Fiocchi d'avena", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL47", "Yogurt bianco intero", "banco_frigo", "fresco", "g"),
    A("AL48", "Marmellata", "conserve", "dispensa", "g"),
    A("AL49", "Pesto alla genovese", "conserve", "dispensa", "g", 190, "vasetto"),
    A("AL51", "Rucola", "verdure", "fresco", "g", 125, "busta"),
    A("AL52", "Pinoli", "frutta", "dispensa", "g"),
    A("AL58", "Funghi misti (champignon, porcini)", "verdure", "fresco", "g"),
    A("AL59", "Cime di rapa", "verdure", "fresco", "g"),
    A("AL60", "Riso Venere", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL61", "Condiriso", "conserve", "dispensa", "g", 290, "vasetto"),
    A("AL62", "Vongole", "banco_frigo", "fresco", "g", surgelato="AL127"),
    A("AL63", "Trofie fresche", "banco_frigo", "fresco", "g", 500, "confezione"),
    A("AL64", "Quinoa", "pasta", "dispensa", "g", 400, "pacco"),
    A("AL65", "Feta", "banco_frigo", "fresco", "g", 200, "confezione"),
    A("AL66", "Ricotta salata", "salumi_formaggi", "fresco", "g"),
    A("AL67", "Zafferano", "pasta", "dispensa", "pz", 1, "bustina"),
    A("AL69", "Cannelloni", "pasta", "dispensa", "g", 250, "pacco"),
    A("AL70", "Tagliatelle fresche", "banco_frigo", "fresco", "g", 250, "confezione"),
    A("AL71", "Asparagi", "verdure", "fresco", "g"),
    A("AL72", "Taleggio", "salumi_formaggi", "fresco", "g"),
    A("AL73", "Spigola filetti", "banco_frigo", "fresco", "g", surgelato="AL123"),
    A("AL74", "Menta fresca", "verdure", "fresco", "g"),
    A("AL76", "Calamari", "banco_frigo", "fresco", "g", surgelato="AL124"),
    A("AL77", "Salvia", "verdure", "fresco", "g"),
    A("AL78", "Polpo", "banco_frigo", "fresco", "g", surgelato="AL125"),
    A("AL79", "Orata filetti", "banco_frigo", "fresco", "g"),
    A("AL80", "Erba cipollina", "verdure", "fresco", "g"),
    A("AL82", "Bresaola", "banco_frigo", "fresco", "g"),
    A("AL83", "Alici fresche", "banco_frigo", "fresco", "g"),
    A("AL84", "Cozze", "banco_frigo", "fresco", "g", surgelato="AL126"),
    A("AL85", "Porri", "verdure", "fresco", "g"),
    A("AL87", "Roast beef", "banco_frigo", "fresco", "g"),
    A("AL88", "Sgombro filetti", "banco_frigo", "fresco", "g"),
    # --- nuovi (mancavano in DB_Alimenti) ---
    A("AL90", "Olio extravergine d'oliva", "conserve", "dispensa", "ml", 1000, "bottiglia"),
    A("AL91", "Aglio", "verdure", "dispensa", "pz"),
    A("AL92", "Limoni", "frutta", "fresco", "pz"),
    A("AL93", "Mozzarella", "banco_frigo", "fresco", "g", 125, "confezione"),
    A("AL94", "Melanzane", "verdure", "fresco", "g"),
    A("AL95", "Peperoni", "verdure", "fresco", "g"),
    A("AL96", "Fagioli cannellini", "conserve", "dispensa", "g", 240, "lattina"),
    A("AL97", "Pere", "frutta", "fresco", "pz"),
    A("AL98", "Finocchi", "verdure", "fresco", "g"),
    A("AL99", "Cavolfiore", "verdure", "fresco", "g"),
    A("AL100", "Spaghetti", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL101", "Prezzemolo", "verdure", "fresco", "g"),
    A("AL102", "Gamberetti surgelati", "congelati", "dispensa", "g", 250, "busta"),
    A("AL103", "Pasta per lasagne", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL104", "Besciamella", "banco_frigo", "dispensa", "g", 200, "confezione"),
    A("AL105", "Cetrioli", "verdure", "fresco", "g"),
    A("AL106", "Minestrone surgelato", "congelati", "dispensa", "g", 750, "busta"),
    A("AL107", "Noci sgusciate", "frutta", "dispensa", "g"),
    A("AL108", "Farina per polenta istantanea", "pasta", "dispensa", "g", 500, "pacco"),
    A("AL109", "Misto mare surgelato", "congelati", "dispensa", "g", 400, "busta"),
    A("AL110", "Olive nere denocciolate", "conserve", "dispensa", "g"),
    A("AL111", "Controfiletto di manzo", "banco_frigo", "fresco", "g"),
    A("AL112", "Curry dolce", "pasta", "dispensa", "g"),
    A("AL113", "Prosciutto crudo", "banco_frigo", "fresco", "g"),
    A("AL114", "Insalata mista", "verdure", "fresco", "g", 125, "busta"),
    A("AL115", "Rosmarino", "verdure", "fresco", "g"),
    A("AL116", "Cosce di pollo", "banco_frigo", "fresco", "g"),
    A("AL117", "Aceto balsamico", "conserve", "dispensa", "ml"),
    A("AL118", "Origano", "pasta", "dispensa", "g"),
    A("AL119", "Miele", "conserve", "dispensa", "g"),
    # --- varianti surgelate del pesce (si usano da martedì a venerdì) ---
    A("AL120", "Merluzzo filetti surgelati", "congelati", "fresco", "g"),
    A("AL121", "Platessa filetti surgelati", "congelati", "fresco", "g"),
    A("AL122", "Salmone surgelato", "congelati", "fresco", "g"),
    A("AL123", "Filetti di spigola surgelati", "congelati", "fresco", "g"),
    A("AL124", "Calamari surgelati", "congelati", "fresco", "g"),
    A("AL125", "Polpo surgelato", "congelati", "fresco", "g"),
    A("AL126", "Cozze surgelate", "congelati", "fresco", "g"),
    A("AL127", "Vongole surgelate", "congelati", "fresco", "g"),
    # --- aggiunti con le nuove ricette ---
    A("AL128", "Cipolle", "verdure", "dispensa", "g"),
    A("AL129", "Sedano", "verdure", "fresco", "g"),
    A("AL130", "Cavolo nero", "verdure", "fresco", "g"),
    A("AL131", "Piadine", "pane", "fresco", "pz", 3, "confezione"),
]

# Duplicati di DB_Alimenti uniti (ID vecchio -> ID tenuto). AL68 (orzo) tolto.
DUPLICATI = {"AL50": "AL14", "AL54": "AL05", "AL56": "AL20", "AL75": "AL03",
             "AL55": "AL06", "AL53": "AL04"}

# Nome ingrediente nei CSV -> (ID alimento, fattore di conversione sulla quantità)
NOMI = {
    "pasta corta": ("AL01", 1), "pasta": ("AL01", 1), "riso": ("AL02", 1),
    "riso carnaroli": ("AL02", 1), "riso parboiled": ("AL02", 1),
    "riso basmati": ("AL03", 1), "farro perlato": ("AL04", 1), "farro": ("AL04", 1),
    "couscous": ("AL05", 1), "gnocchi patate": ("AL06", 1), "gnocchi di patate": ("AL06", 1),
    "pastina": ("AL07", 1), "ceci precotti": ("AL08", 1), "ceci in scatola": ("AL08", 1),
    "fagioli borlotti": ("AL09", 1), "lenticchie scatola": ("AL10", 1),
    "lenticchie in scatola": ("AL10", 1), "lenticchie rosse": ("AL11", 1),
    "piselli surgelati": ("AL12", 1), "passata pomodoro": ("AL13", 1),
    "passata di pomodoro": ("AL13", 1), "zucca": ("AL14", 1), "zucchine": ("AL15", 1),
    "carote": ("AL16", 1), "patate": ("AL17", 1), "spinaci": ("AL18", 1),
    "broccoli": ("AL20", 1), "pomodorini": ("AL21", 1), "latte intero": ("AL25", 1),
    "burro": ("AL26", 1), "parmigiano": ("AL27", 1), "formaggio grattugiato": ("AL27", 1),
    "grana a scaglie": ("AL27", 1), "ricotta": ("AL28", 1), "robiola": ("AL29", 1),
    "macinato tacchino": ("AL31", 1), "hamburger di tacchino": ("AL31", 1),
    "macinato manzo": ("AL32", 1), "carne macinata magra": ("AL32", 1),
    "petto di pollo": ("AL33", 1), "fesa tacchino": ("AL34", 1), "lonza maiale": ("AL35", 1),
    "vitello fettine": ("AL36", 1), "fesa di vitello": ("AL36", 1),
    "merluzzo filetti": ("AL37", 1), "filetto di merluzzo": ("AL37", 1),
    "platessa filetti": ("AL38", 1), "salmone trancio": ("AL39", 1),
    "salmone fresco": ("AL39", 1), "tonno scatola": ("AL40", 1),
    "tonno in scatola": ("AL40", 1), "pangrattato": ("AL41", 1), "farina": ("AL42", 1),
    "pane fette": ("AL43", 1), "pasta sfoglia": ("AL44", 1),
    "prosciutto cotto": ("AL45", 1), "pesto senz'aglio": ("AL49", 1),
    "pesto alla genovese": ("AL49", 1), "rucola": ("AL51", 1), "pinoli": ("AL52", 1),
    "funghi porcini": ("AL58", 1), "funghi misti": ("AL58", 1), "riso venere": ("AL60", 1),
    "condiriso": ("AL61", 1), "vongole": ("AL62", 1), "trofie": ("AL63", 1),
    "quinoa": ("AL64", 1), "feta": ("AL65", 1), "ricotta salata": ("AL66", 1),
    "zafferano": ("AL67", 0.25), "cannelloni": ("AL69", 1), "tagliatelle": ("AL70", 1),
    "asparagi": ("AL71", 1), "taleggio": ("AL72", 1), "spigola filetto": ("AL73", 1),
    "menta fresca": ("AL74", 1), "calamari": ("AL76", 1), "salvia": ("AL77", 1),
    "polpo": ("AL78", 1), "orata filetto": ("AL79", 1), "erba cipollina": ("AL80", 1),
    "bresaola": ("AL82", 1), "alici fresche": ("AL83", 1), "cozze": ("AL84", 1),
    "porri": ("AL85", 1), "roast beef": ("AL87", 1), "sgombro filetto": ("AL88", 1),
    "olio evo": ("AL90", 1), "aglio": ("AL91", 0.2), "limone": ("AL92", 0.1),
    "mozzarella": ("AL93", 1), "melanzane": ("AL94", 1), "peperoni": ("AL95", 1),
    "fagioli cannellini": ("AL96", 1), "cavolfiore": ("AL99", 1), "spaghetti": ("AL100", 1),
    "prezzemolo": ("AL101", 1), "gamberetti": ("AL102", 1),
    "pasta per lasagne": ("AL103", 1), "besciamella": ("AL104", 1),
    "cetrioli": ("AL105", 1), "minestrone surgelato": ("AL106", 1),
    "noci": ("AL107", 1), "polenta": ("AL108", 1), "misto mare": ("AL109", 1),
    "olive nere": ("AL110", 1), "controfiletto di manzo": ("AL111", 1),
    "curry in polvere": ("AL112", 1), "prosciutto crudo": ("AL113", 1),
    "insalata mista": ("AL114", 1), "rosmarino": ("AL115", 1),
    "cosce di pollo": ("AL116", 1), "aceto balsamico": ("AL117", 1), "origano": ("AL118", 1),
    # Uova: nei CSV a volte a pezzi, a volte a grammi (1 uovo ~ 60 g)
    "uova": ("AL30", 1),
}

# Contorno e frutta (testo libero nei CSV) -> ingredienti a porzione
CONTORNI = [
    ("purè di patate", [("AL17", 180), ("AL25", 30)]),
    ("fagiolini", [("AL19", 150)]), ("carote", [("AL16", 120)]),
    ("zucchine", [("AL15", 150)]), ("spinaci", [("AL18", 150)]),
    ("patate", [("AL17", 180)]), ("piselli", [("AL12", 100)]),
    ("pomodorini", [("AL21", 100)]), ("finocchi", [("AL98", 150)]),
    ("frutta stagione", [("AL24", 1)]), ("banana", [("AL23", 1)]),
    ("mela", [("AL22", 1)]), ("pera", [("AL97", 1)]),
]

# Eliminate: non adatte a un bimbo di 2 anni (piccante, crudo, carbonara, acciughe,
# branzino al sale) e doppioni.
ESCLUSE = {"PRA36", "PRA56", "CEN57", "PRA49", "PRA38", "PRA40", "CEN60", "CEN49"}
DOPPIONI = {"PRA51": "PRA09", "PRA52": "PRA30"}

# Tempi (preparazione attiva, totale) in minuti, stimati.
TEMPI = {
    "PRA01": (10, 25), "PRA02": (20, 35), "PRA03": (10, 25), "PRA04": (15, 20),
    "PRA05": (15, 30), "PRA06": (10, 25), "PRA07": (15, 30), "PRA08": (15, 30),
    "PRA09": (10, 25), "PRA10": (15, 25), "PRA11": (10, 20), "PRA12": (5, 15),
    "PRA13": (15, 35), "PRA14": (15, 30), "PRA15": (10, 25), "PRA16": (10, 25),
    "PRA17": (15, 40), "PRA18": (15, 30), "PRA19": (10, 20), "PRA20": (10, 35),
    "PRA21": (10, 20), "PRA22": (15, 30), "PRA23": (10, 30), "PRA24": (10, 20),
    "PRA25": (10, 15), "PRA26": (15, 30), "PRA27": (10, 35), "PRA28": (20, 35),
    "PRA29": (10, 25), "PRA30": (10, 30), "PRA31": (15, 30), "PRA32": (10, 20),
    "PRA33": (10, 35), "PRA34": (15, 20), "PRA35": (10, 20), "PRA37": (15, 25),
    "PRA39": (15, 30), "PRA41": (15, 50), "PRA42": (15, 30), "PRA43": (20, 30),
    "PRA44": (15, 30), "PRA45": (15, 30), "PRA46": (5, 20), "PRA47": (35, 75),
    "PRA48": (15, 25), "PRA50": (20, 35), "PRA53": (10, 40), "PRA54": (30, 70),
    "PRA55": (15, 25), "PRA57": (10, 25), "PRA58": (15, 25), "PRA59": (15, 30),
    "PRA60": (15, 30),
    "CEN01": (20, 45), "CEN02": (10, 30), "CEN03": (15, 40), "CEN04": (15, 35),
    "CEN05": (15, 30), "CEN06": (15, 45), "CEN07": (15, 35), "CEN08": (10, 20),
    "CEN09": (20, 45), "CEN10": (10, 30), "CEN11": (15, 100), "CEN12": (15, 50),
    "CEN13": (20, 40), "CEN14": (10, 30), "CEN15": (10, 15), "CEN16": (15, 35),
    "CEN17": (20, 60), "CEN18": (10, 30), "CEN19": (15, 30), "CEN20": (10, 25),
    "CEN21": (25, 50), "CEN22": (10, 25), "CEN23": (5, 15), "CEN24": (20, 40),
    "CEN25": (10, 30), "CEN26": (10, 15), "CEN27": (15, 45), "CEN28": (20, 45),
    "CEN29": (20, 55), "CEN30": (10, 25), "CEN31": (10, 30), "CEN32": (10, 20),
    "CEN33": (10, 25), "CEN34": (15, 30), "CEN35": (10, 25), "CEN36": (25, 55),
    "CEN37": (10, 20), "CEN38": (20, 35), "CEN39": (10, 25), "CEN40": (15, 50),
    "CEN41": (20, 45), "CEN42": (10, 20), "CEN43": (15, 55), "CEN44": (15, 30),
    "CEN45": (20, 40), "CEN46": (10, 15), "CEN47": (20, 60), "CEN48": (20, 35),
    "CEN50": (10, 60), "CEN51": (10, 10), "CEN52": (10, 20), "CEN53": (25, 45),
    "CEN54": (20, 35), "CEN55": (25, 50), "CEN56": (15, 35), "CEN58": (5, 5),
    "CEN59": (10, 30),
}

PROTEINE = {
    "nessuna (solo carbo)": "Nessuna", "nessuna": "Nessuna", "legumi": "Legumi",
    "pesce": "Pesce", "uova": "Uova", "uova/formaggio": "Uova",
    "formaggio": "Formaggi", "formaggio (alta)": "Formaggi", "formaggio (media)": "Formaggi",
    "formaggio (bassa)": "Formaggi", "latticini": "Formaggi", "formaggio/uova": "Formaggi",
    "carne bianca": "Carne bianca", "carne rossa": "Carne rossa",
    "carne bianca/suino": "Carne rossa", "carne/affettato": "Carne rossa",
}
# "Carne" generica delle ricette 31-60: bianca o rossa secondo l'ingrediente
CARNE_BIANCA = {"AL31", "AL33", "AL34", "AL116"}

# Correzioni puntuali
RINOMINA = {
    "PRA53": "Minestrone di verdure con farro",
    "PRA09": "Risotto allo zafferano",
    "CEN34": "Pollo al curry dolce con riso basmati",
    "CEN18": "Tonno con pomodorini e patate",
}
DEPERIBILITA = {"PRA32": "Alta"}  # rucola fresca
# Ingredienti aggiunti (contorni mancanti, condimenti citati nel nome)
AGGIUNTE = {
    "PRA09": [("AL67", 0.25)],
    "PRA31": [("AL115", 2)],
    "PRA53": [("AL04", 70)],
    "CEN08": [("AL92", 0.2), ("AL90", 10)],
    "CEN22": [("AL77", 2)],
    "CEN36": [("AL114", 80)],
    "CEN37": [("AL16", 120)],
    "CEN38": [("AL19", 150)],
    "CEN41": [("AL17", 150)],
    "CEN55": [("AL15", 150)],
    "CEN59": [("AL17", 150)],
}
# Ingredienti tolti
TOGLI = {"PRA53": {"orzo perlato"}, "CEN49": {"sale grosso"}}


# Nuove ricette (non presenti nell'Excel). Stessi vincoli: adatte a un bimbo di
# 2 anni, max 30 min attivi e 60 totali, dosi per UNA porzione, ingredienti per ID.
# (id, nome, proteina, deperibilita, stagioni, prep, totale, [(ID, quantità)])
TUTTE = "tutte"
AI = "autunno inverno"
PE = "primavera estate"
NUOVE = [
    ("PRA61", "Pasta e lenticchie rosse", "Legumi", "Bassa", TUTTE, 10, 25,
     [("AL01", 70), ("AL11", 50), ("AL128", 20), ("AL16", 50), ("AL90", 10)]),
    ("PRA62", "Risotto ai piselli", "Legumi", "Bassa", TUTTE, 10, 25,
     [("AL02", 80), ("AL12", 100), ("AL128", 20), ("AL27", 15), ("AL90", 5)]),
    ("PRA63", "Pasta al tonno e pomodoro", "Pesce", "Bassa", TUTTE, 10, 20,
     [("AL01", 80), ("AL40", 60), ("AL13", 100), ("AL90", 10)]),
    ("PRA64", "Couscous con merluzzo e zucchine", "Pesce", "Alta", PE, 15, 25,
     [("AL05", 70), ("AL37", 100), ("AL15", 120), ("AL90", 10)]),
    ("PRA65", "Farro con ceci, zucca e rosmarino", "Legumi", "Media", AI, 15, 40,
     [("AL04", 70), ("AL08", 100), ("AL14", 150), ("AL115", 2), ("AL90", 10)]),
    ("PRA66", "Frittata di spaghetti", "Uova", "Bassa", TUTTE, 15, 35,
     [("AL100", 70), ("AL30", 1), ("AL27", 15), ("AL25", 30), ("AL90", 5)]),
    ("PRA67", "Riso basmati saltato con pollo e verdure", "Carne bianca", "Alta", TUTTE, 15, 25,
     [("AL03", 70), ("AL33", 100), ("AL16", 60), ("AL15", 80), ("AL90", 10)]),
    ("PRA68", "Insalata di quinoa, ceci e verdure", "Legumi", "Media", PE, 15, 25,
     [("AL64", 60), ("AL08", 100), ("AL21", 80), ("AL105", 60), ("AL90", 10)]),
    ("PRA69", "Minestra di ceci e pastina", "Legumi", "Bassa", AI, 10, 30,
     [("AL07", 50), ("AL08", 120), ("AL16", 50), ("AL129", 30), ("AL90", 10)]),
    ("PRA70", "Spaghetti al ragù di tacchino", "Carne bianca", "Alta", TUTTE, 15, 40,
     [("AL100", 80), ("AL31", 80), ("AL13", 120), ("AL128", 20), ("AL16", 30), ("AL90", 10)]),
    ("PRA71", "Pasta con zucchine e gamberetti", "Pesce", "Bassa", TUTTE, 15, 25,
     [("AL01", 80), ("AL102", 80), ("AL15", 120), ("AL90", 10)]),
    ("PRA72", "Pasta e cannellini con cavolo nero", "Legumi", "Media", AI, 15, 35,
     [("AL01", 60), ("AL96", 120), ("AL130", 100), ("AL13", 50), ("AL90", 10)]),
    ("PRA73", "Risotto al salmone", "Pesce", "Alta", TUTTE, 15, 30,
     [("AL02", 80), ("AL39", 80), ("AL128", 15), ("AL90", 10)]),
    ("PRA74", "Polenta con ragù di lenticchie", "Legumi", "Bassa", AI, 15, 30,
     [("AL108", 70), ("AL10", 120), ("AL13", 100), ("AL16", 40), ("AL90", 10)]),
    ("PRA75", "Pasta con zucchine e uova", "Uova", "Media", PE, 10, 20,
     [("AL01", 80), ("AL15", 150), ("AL30", 1), ("AL27", 10), ("AL90", 10)]),
    ("PRA76", "Couscous con pollo e verdure", "Carne bianca", "Alta", TUTTE, 15, 25,
     [("AL05", 70), ("AL33", 100), ("AL95", 80), ("AL15", 80), ("AL90", 10)]),
    ("PRA77", "Pasta al pesto con patate e fagiolini", "Nessuna", "Media", PE, 10, 25,
     [("AL01", 80), ("AL49", 30), ("AL19", 80), ("AL17", 80)]),
    ("PRA78", "Vellutata di zucca e lenticchie rosse con crostini", "Legumi", "Media", AI, 15, 35,
     [("AL14", 200), ("AL11", 50), ("AL17", 80), ("AL43", 40), ("AL90", 10)]),
    ("PRA79", "Pasta con salmone e piselli", "Pesce", "Alta", TUTTE, 15, 25,
     [("AL01", 80), ("AL39", 70), ("AL12", 70), ("AL90", 10)]),
    ("PRA80", "Polpettine di ceci con riso basmati", "Legumi", "Bassa", TUTTE, 20, 40,
     [("AL03", 60), ("AL08", 100), ("AL41", 15), ("AL16", 50), ("AL90", 10)]),
    ("CEN61", "Burger di cannellini e spinaci con patate al forno", "Legumi", "Bassa", TUTTE, 20, 40,
     [("AL96", 120), ("AL18", 80), ("AL41", 20), ("AL17", 150), ("AL90", 10)]),
    ("CEN62", "Pollo alla pizzaiola con fagiolini", "Carne bianca", "Alta", TUTTE, 10, 25,
     [("AL33", 150), ("AL13", 100), ("AL93", 30), ("AL118", 1), ("AL19", 150), ("AL90", 10)]),
    ("CEN63", "Frittata al forno con patate e piselli", "Uova", "Media", TUTTE, 15, 40,
     [("AL30", 2), ("AL17", 120), ("AL12", 60), ("AL27", 10), ("AL90", 5)]),
    ("CEN64", "Merluzzo al forno con patate e pomodorini", "Pesce", "Alta", TUTTE, 15, 40,
     [("AL37", 160), ("AL17", 150), ("AL21", 80), ("AL90", 10)]),
    ("CEN65", "Piadina con ricotta e spinaci", "Formaggi", "Media", TUTTE, 10, 20,
     [("AL131", 1), ("AL28", 80), ("AL18", 100), ("AL90", 5)]),
    ("CEN66", "Zuppa di ceci e patate con pane tostato", "Legumi", "Bassa", AI, 10, 35,
     [("AL08", 150), ("AL17", 120), ("AL16", 60), ("AL128", 20), ("AL43", 30), ("AL90", 10)]),
    ("CEN67", "Fesa di tacchino al latte con carote", "Carne bianca", "Alta", TUTTE, 10, 30,
     [("AL34", 150), ("AL25", 80), ("AL42", 10), ("AL16", 150), ("AL90", 5)]),
    ("CEN68", "Salmone gratinato con zucchine", "Pesce", "Alta", TUTTE, 10, 30,
     [("AL39", 150), ("AL41", 15), ("AL15", 150), ("AL90", 10)]),
    ("CEN69", "Sformato di cavolfiore e mozzarella", "Formaggi", "Media", AI, 15, 45,
     [("AL99", 200), ("AL93", 50), ("AL27", 15), ("AL25", 50), ("AL41", 10)]),
    ("CEN70", "Polpette di platessa e zucchine con patate", "Pesce", "Alta", TUTTE, 20, 40,
     [("AL38", 130), ("AL15", 80), ("AL41", 20), ("AL30", 0.3), ("AL17", 150)]),
    ("CEN71", "Uova al pomodoro con pane tostato", "Uova", "Bassa", TUTTE, 5, 20,
     [("AL30", 2), ("AL13", 150), ("AL43", 40), ("AL90", 5)]),
    ("CEN72", "Crema di lenticchie rosse e carote con crostini", "Legumi", "Bassa", TUTTE, 10, 30,
     [("AL11", 60), ("AL16", 100), ("AL17", 80), ("AL43", 40), ("AL90", 10)]),
    ("CEN73", "Spiedini di pollo e verdure al forno", "Carne bianca", "Alta", PE, 20, 40,
     [("AL33", 150), ("AL95", 80), ("AL15", 80), ("AL90", 10)]),
    ("CEN74", "Torta salata di zucca e ricotta", "Formaggi", "Media", AI, 15, 50,
     [("AL44", 0.4), ("AL14", 150), ("AL28", 80), ("AL30", 0.4)]),
    ("CEN75", "Merluzzo surgelato in umido con piselli", "Pesce", "Bassa", TUTTE, 10, 30,
     [("AL120", 160), ("AL12", 100), ("AL13", 100), ("AL90", 10)]),
    ("CEN76", "Mozzarella in carrozza al forno con insalata", "Formaggi", "Media", TUTTE, 15, 30,
     [("AL43", 60), ("AL93", 80), ("AL30", 0.5), ("AL25", 30), ("AL114", 80), ("AL90", 5)]),
    ("CEN77", "Hamburger di pollo e zucchine con patate", "Carne bianca", "Alta", TUTTE, 20, 45,
     [("AL33", 140), ("AL15", 60), ("AL41", 15), ("AL17", 150), ("AL90", 10)]),
    ("CEN78", "Polenta con fagioli borlotti al pomodoro", "Legumi", "Bassa", AI, 10, 30,
     [("AL108", 60), ("AL09", 150), ("AL13", 100), ("AL90", 10)]),
    ("CEN79", "Insalata di patate, fagiolini, tonno e uova", "Pesce", "Media", PE, 15, 30,
     [("AL17", 150), ("AL19", 100), ("AL40", 60), ("AL30", 1), ("AL90", 10)]),
    ("CEN80", "Crespelle ricotta e spinaci al forno", "Formaggi", "Media", TUTTE, 25, 50,
     [("AL42", 25), ("AL25", 60), ("AL30", 0.5), ("AL28", 80), ("AL18", 100), ("AL27", 10)]),
]


def leggi_procedimenti():
    proc = {}
    with open(os.path.join(RADICE, "strumenti", "procedimenti.txt"), encoding="utf-8") as f:
        for riga in f:
            riga = riga.strip()
            if not riga or riga.startswith("#"):
                continue
            parti = [x.strip() for x in riga.split("|")]
            proc[parti[0]] = [x for x in parti[1:] if x]
    return proc


def num(s):
    s = (s or "").strip().replace(",", ".")
    return float(s) if s else 0.0


def arrotonda(q, unita):
    if unita in ("g", "ml"):
        return max(1, int(round(q / 5.0) * 5)) if q >= 5 else round(q, 1)
    return round(q, 2)


def stagioni(s):
    s = (s or "").strip().lower()
    tutte = ["primavera", "estate", "autunno", "inverno"]
    if not s or s == "tutte":
        return tutte
    return [x for x in tutte if x in s]


def leggi(nome_file):
    with open(os.path.join(ARCHIVIO, nome_file), encoding="utf-8-sig") as f:
        return list(csv.reader(f, delimiter=";"))


def main():
    alimenti = {a["id"]: a for a in ALIMENTI}
    ricette = []
    avvisi = []

    for file_csv, pasto in (("DB_Pranzo.csv", "pranzo"), ("DB_Cena.csv", "cena")):
        righe = leggi(file_csv)[1:]
        for r in righe:
            if not r or not r[0].strip():
                continue
            rid = r[0].strip()
            if rid in ESCLUSE or rid in DOPPIONI:
                continue
            numero = int(rid[3:])
            nome = RINOMINA.get(rid, r[1].strip())
            ingr = []
            contorno = ""
            if numero <= 30:
                coppie = [(r[3], r[4]), (r[5], r[6]), (r[7], r[8])]
                contorno, prot, dep, stag = r[9], r[10], r[11], r[12]
            else:
                coppie = [(r[3], r[4]), (r[5], r[6]), (r[7], r[8]), (r[9], r[10])]
                prot, dep, stag = r[11], r[12], r[13]
            # Le cene 1-30 erano scritte per tutta la famiglia (x2,5)
            fattore_famiglia = 2.5 if (pasto == "cena" and numero <= 30) else 1.0
            for n, q in coppie:
                n = n.strip()
                if not n or n.lower() in TOGLI.get(rid, set()):
                    continue
                if n.lower() not in NOMI:
                    avvisi.append(f"{rid}: ingrediente sconosciuto '{n}'")
                    continue
                aid, conv = NOMI[n.lower()]
                qv = num(q)
                if aid == "AL30" and qv > 12:      # uova espresse in grammi
                    qv = qv / 60.0
                if aid == "AL44" and qv > 5:       # sfoglia in grammi (rotolo 230 g)
                    qv = qv / 230.0
                if aid == "AL44":
                    qv = 0.4 * fattore_famiglia   # un rotolo per 2,5 porzioni
                qv = qv * conv / fattore_famiglia
                ingr.append([aid, qv])
            # contorno e frutta come ingredienti
            cl = contorno.lower()
            for chiave, lista in CONTORNI:
                if chiave in cl:
                    if chiave == "patate" and "purè di patate" in cl:
                        continue
                    for aid, qv in lista:
                        ingr.append([aid, qv])
            for aid, qv in AGGIUNTE.get(rid, []):
                ingr.append([aid, qv])
            # unisci ripetizioni dello stesso alimento
            somma = {}
            for aid, qv in ingr:
                somma[aid] = somma.get(aid, 0) + qv
            ingr = [{"id": aid, "q": arrotonda(qv, alimenti[aid]["unita"])}
                    for aid, qv in somma.items()]

            p = PROTEINE.get(prot.strip().lower())
            if prot.strip().lower() == "carne":
                p = "Carne bianca" if any(i["id"] in CARNE_BIANCA for i in ingr) else "Carne rossa"
            if not p:
                avvisi.append(f"{rid}: categoria proteica sconosciuta '{prot}'")
                p = "Nessuna"
            prep, tot = TEMPI[rid]
            ric = {
                "id": rid, "nome": nome, "pasto": pasto, "proteina": p,
                "deperibilita": DEPERIBILITA.get(rid, dep.strip().capitalize()),
                "stagioni": stagioni(stag), "tempoPrep": prep, "tempoTotale": tot,
                "ingredienti": ingr,
            }
            if contorno.strip():
                ric["contorno"] = contorno.strip()
            ricette.append(ric)

    for rid, nome, prot, dep, stag, prep, tot, ingr in NUOVE:
        for aid, _ in ingr:
            if aid not in alimenti:
                avvisi.append(f"{rid}: alimento sconosciuto {aid}")
        ricette.append({
            "id": rid, "nome": nome, "pasto": "pranzo" if rid.startswith("PRA") else "cena",
            "proteina": prot, "deperibilita": dep, "stagioni": stagioni(stag),
            "tempoPrep": prep, "tempoTotale": tot,
            "ingredienti": [{"id": aid, "q": q} for aid, q in ingr if aid in alimenti],
        })

    proc = leggi_procedimenti()
    for r in ricette:
        if r["id"] in proc:
            r["procedimento"] = proc[r["id"]]
        else:
            avvisi.append(f"{r['id']}: manca il procedimento")
    for rid in proc:
        if not any(r["id"] == rid for r in ricette):
            avvisi.append(f"procedimento per ricetta inesistente {rid}")
    ricette.sort(key=lambda r: (r["pasto"] != "pranzo", r["id"]))

    for a in alimenti.values():
        if a.get("surgelato") and a["surgelato"] not in alimenti:
            avvisi.append(f"{a['id']}: variante surgelata mancante")

    os.makedirs(DATI, exist_ok=True)
    with open(os.path.join(DATI, "alimenti.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(a, ensure_ascii=False) for a in ALIMENTI) + "\n]\n")
    with open(os.path.join(DATI, "ricette.json"), "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in ricette) + "\n]\n")

    print(f"Alimenti: {len(ALIMENTI)}  Ricette: {len(ricette)} "
          f"(pranzi {sum(r['pasto']=='pranzo' for r in ricette)}, "
          f"cene {sum(r['pasto']=='cena' for r in ricette)})")
    for a in avvisi:
        print("ATTENZIONE:", a)
    return 1 if avvisi else 0


if __name__ == "__main__":
    sys.exit(main())
