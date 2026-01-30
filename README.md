# Gerwing Steinwerke – Dual-Werk Preisrechner (Classic)

## Dateien
- `index.html` – Startseite (Werk auswählen)
- `preisrechner.html` – Rechner (nutzt `?werk=holdorf` / `?werk=clausnitz`)
- `zones_holdorf.csv`, `rates_holdorf.csv`
- `zones_clausnitz.csv`, `rates_clausnitz.csv`
- `floater_holdorf.json`, `floater_clausnitz.json`
- `surcharges_holdorf.json`, `surcharges_clausnitz.json`

## Wichtig
- **Gewicht in kg** (CHG-Bänder in `rates_*.csv`).
- Zonen werden aus `zones_*.csv` per PLZ-Range ermittelt.
- Zuschläge werden **aus `surcharges_*.json`** geladen (Baustelle / 2. Stopp / 3. Stopp).
- Floater (%) werden aus `floater_*.json` geladen.

## Setup in GitHub Pages
1. Repo anlegen (public, oder private + Enterprise/paid, sonst Pages nicht möglich).
2. Diese Dateien in den **Root** hochladen.
3. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)` → Save.
4. Öffnen:
   - `https://<user>.github.io/<repo>/`
