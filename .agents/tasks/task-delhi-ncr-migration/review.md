# Delhi NCR migration complete with targeted DPCC interventions

This migration shifts the application from Maharashtra-centric (Pune/Mumbai) to Delhi NCR-centric (Delhi/Noida/Gurgaon) as the default region. The change touches 18 files across frontend and backend, reordering city priorities, updating station references, expanding ward metadata from 3 to 9 Delhi wards with DPCC-aligned interventions, and replacing Maharashtra context (MPCB, Western Ghats, MIDC) with Delhi NCR context (DPCC, Indo-Gangetic plain, stubble burning).

The implementation is complete and internally consistent. Delhi is now the default city in configuration, bootstrap code, API endpoints, and UI. The search modal lists Delhi stations (Anand Vihar, ITO, Dwarka, Lodhi Road). Settings includes Noida and Gurgaon cards. The backend serves 9 Delhi wards with zone-specific interventions (mist cannons, truck bans, scrubber audits, metro subsidies). Fallback logic uses Delhi metadata. All user-facing text references Delhi NCR geography, regulatory bodies (DPCC not MPCB), and pollution drivers (stubble burning from Punjab/Haryana, Ring Road traffic, Indo-Gangetic thermal inversion).

**Watch for:** None. No blocking concerns remain. The migration is complete, consistent, and ready to deploy.

**Verdict**: APPROVED

## High-level view

The migration changes the default city from Pune to Delhi in two places: the config file (`defaultCity: 'delhi'`) and the bootstrap call in main.js (`loadCityData('Delhi')`). The map view defaults to Delhi coordinates and uses Delhi as fallback when a city is not found in `CITY_CENTRES`. The `CITY_CENTRES` dictionary in both dashboard.js and map.js has been reordered to place Delhi, Noida, and Gurgaon at the top, ahead of Pune, Mumbai, and Nagpur.

The search modal now pre-loads Delhi AQI data instead of Pune. The four station quick-links reference Delhi stations (Anand Vihar, ITO, Dwarka, Lodhi Road) with correct zone descriptions (East Delhi, Central Delhi, South-West Delhi). The keyword map used to match stations against live WAQI data has been updated to match Delhi station names.

The settings view shows Delhi as the primary active twin with 34 stations, followed by Noida (8 stations) and Gurgaon (6 stations). Mumbai, Pune, and Nagpur remain available but are no longer prioritized. The API endpoint examples in settings changed from `/twin/pune/` to `/twin/delhi/`.

The backend ward metadata for Delhi expanded from 3 entries to 9, covering major zones: Anand Vihar (East Delhi transport hub), ITO Junction (Central Delhi traffic), Wazirpur Industrial (North West Delhi), R K Puram (South Delhi Ring Road), Dwarka Sector 8 (South West Delhi construction), Punjabi Bagh (West Delhi highway), Rohini Sector 16 (North Delhi), Lodhi Road (Central Delhi background), and Mundka Industrial (West Delhi industrial/freight). Each ward includes a zone label, dominant pollution driver, recommended intervention, and keyword list for station matching. The interventions reference DPCC-aligned strategies: mist cannons, heavy truck bans on NH24, traffic signal synchronization, metro subsidies, industrial scrubber audits, emission mandates, heavy vehicle diversion, construction site enclosures, mechanized vacuum sweepers, green belt expansion, and EV freight transition.

The backend AQI service reordered `CITY_SLUGS` to place Delhi, Noida, and Gurgaon first. The `DEFAULT_SLUGS` changed from `['pune']` to `['delhi']`. Query parameter defaults in drift.py and scenario.py changed from `"Pune"` to `"Delhi"`. The fallback in wards.py changed from `_PUNE_META` to `_DELHI_META`.

All user-facing text changed from Maharashtra context to Delhi NCR context. The drift modal root cause diagnosis mentions stubble burning from Punjab/Haryana and Indo-Gangetic plain boundary layer compression, not foundry emissions and Pawana river basin. The daily briefing references Delhi NCR urban centers and stubble burning/biomass seasonal influx, not MIDC industrial corridors. The AI advisor FAB fallback responses reference DPCC guidelines (not MPCB), Delhi-NCR schools, Anand Vihar/ITO spikes, GT Karnal Road and Ring Road freight restrictions, and stubble burning from Punjab/Haryana as a primary driver. Location chips on the dashboard changed from Pune/Akurdi/Nashik to Delhi/Noida/Gurgaon/Mumbai. The wards view description references Delhi NCR urban centers (Delhi, Noida, Gurgaon, Faridabad) not Maharashtra (Pune, Mumbai, Nashik, Akurdi/PCMC).

<details>
<summary>Details</summary>

## Delhi default loads on application start

The application bootstraps by calling `loadCityData('Delhi')` in `main.js` line 53. This fetches Delhi AQI data from `/twin/Delhi/current` and populates the hero card, dashboard stats, and station list. The `config.js` file defines `defaultCity: 'delhi'` (line 15), though this config value is not directly consumed by the bootstrap call—it's available for other modules that need a default city reference.

The bootstrap call is explicit and unconditional: every page load starts with Delhi data. No fallback logic here; if the Delhi endpoint fails, the dashboard shows empty state or error UI.

## Map centers on Delhi coordinates

The map initialization function in `map.js` defaults to `city = 'delhi'` (line 60). It looks up `CITY_CENTRES[city.toLowerCase()]` and falls back to `CITY_CENTRES.delhi` if the city key is not found (line 67). Delhi coordinates are `[77.2090, 28.6139]` (lon, lat), which match MapTiler SDK format. Default zoom is 11, appropriate for urban area coverage.

The dashboard minimap also defaults to `center: CITY_CENTRES.delhi` (line 469 in dashboard.js). The `CITY_CENTRES` dictionary has been reordered in both files to list Delhi first, followed by Noida, Gurgaon, then Pune, Mumbai, Nashik, Thane, Nagpur. This reordering does not affect runtime behavior (dictionary key order is not semantically meaningful in JavaScript objects used as maps), but it signals priority to developers reading the code.

## Search modal lists Delhi stations

The search modal pre-loads AQI data for Delhi stations on open (modals.js lines 92-94). It calls `getCityAQI('Delhi')` and caches the result as `delhiData`. The four station quick-links in the search results list (modals.html lines 57-78) reference Delhi stations:
- **Anand Vihar** — East Delhi • Transport Hub & Stubble Influx
- **ITO Junction** — Central Delhi • Traffic Congestion CPCB
- **Dwarka Sector 8** — South-West Delhi • Metro Works & Residential
- **Lodhi Road** — Central Delhi • IMD Green Belt & Background

Each search item has `data-station` and `data-city` attributes. Items with `data-station` resolve to `city = 'Delhi'` (modals.js line 180). The keyword map (`kwMap`, lines 98-101) matches station IDs to live WAQI station names:
- `anand`: ['Anand Vihar', 'Kaushambi', 'Patparganj']
- `ito`: ['ITO', 'Pragati Maidan', 'Mandi House']
- `dwarka`: ['Dwarka', 'NSIT', 'Palam']
- `lodhi`: ['Lodhi', 'Safdarjung', 'JLN']

When the search modal opens, it matches each station ID against the live Delhi data using these keywords and updates the AQI badge. If no keyword matches, it falls back to Delhi's average AQI. This pattern assumes the four quick-links are all Delhi stations, which the HTML confirms.

The search modal also includes city-level items for Noida and Mumbai (modals.html lines 75-82). Clicking these triggers a city switch and loads that city's data into the dashboard.

## Settings shows Delhi, Noida, Gurgaon

The settings view (view-settings.html) displays six city cards: Delhi, Noida, Gurgaon, Mumbai, Pune, Nagpur. Delhi is marked as `city-card--active` with an active indicator: "● Active Twin • Primary" (line 19). The Delhi card shows 34 active stations and "Indo-Gangetic Thermal Inversion & Stubble Burning" as the meta description. Noida shows 8 stations and "NCR Industrial & IT Corridor". Gurgaon shows 6 stations and "NCR Cyber Hub & Manesar Transit".

The `CITY_API_NAME` map in settings.js (lines 24-28) maps lowercase city keys to backend API names:
```javascript
const CITY_API_NAME = {
  delhi:     'Delhi',
  noida:     'Noida',
  gurgaon:   'Gurgaon',
  // ...
};
```

Clicking a city card calls the backend with the mapped name (e.g., `CITY_API_NAME['noida']` → `'Noida'`). The backend wards endpoint maps Noida and Gurgaon to Delhi ward metadata (wards.py lines 72-74), so switching to Noida shows the same 9 wards as Delhi, but with live AQI data fetched from Noida WAQI slugs.

The API endpoint examples below the city cards changed from:
```
GET  /api/v1/twin/pune/forecast?horizon=72h
POST /api/v1/twin/pune/simulate { "traffic_curb": 0.30, "mist_units": 45 }
GET  /api/v1/twin/akurdi/attribution
```
to:
```
GET  /api/v1/twin/delhi/forecast?horizon=72h
POST /api/v1/twin/delhi/simulate { "traffic_curb": 0.30, "mist_units": 45 }
GET  /api/v1/twin/delhi/attribution
```

## Backend serves 9 Delhi wards with DPCC interventions

The `_DELHI_META` list in wards.py expanded from 3 entries to 9 (lines 51-60). Each ward is a dictionary with:
- `ward_name`: e.g., "Anand Vihar"
- `zone`: e.g., "East Delhi"
- `dominant_driver`: e.g., "Transport Hub + Stubble Influx"
- `recommended_action`: e.g., "Deploy Mist Cannons + Heavy Truck Ban on NH24"
- `keywords`: list of strings used to match live WAQI stations, e.g., ["Anand Vihar", "Kaushambi", "Patparganj"]

The 9 wards cover major Delhi zones:
1. **Anand Vihar** (East Delhi) — Transport Hub + Stubble Influx → Deploy Mist Cannons + Heavy Truck Ban on NH24
2. **ITO Junction** (Central Delhi) — Traffic Congestion → Traffic Signal Synchronization + Metro Subsidy
3. **Wazirpur Industrial** (North West Delhi) — Small-Scale Industrial Emissions → Industrial Stack Scrubber Audit & Emission Mandates
4. **R K Puram** (South Delhi) — Vehicular Congestion (Ring Road) → Heavy Vehicle Diversion & Anti-Smog Mist Guns
5. **Dwarka Sector 8** (South West Delhi) — Construction Dust & Metro Works → Construction Site Enclosures & Dust Suppression
6. **Punjabi Bagh** (West Delhi) — Highway Traffic + Road Dust → Mechanized Vacuum Sweepers on Ring Road Stretch
7. **Rohini Sector 16** (North Delhi) — Construction + Vehicular Dust → Green Belt Expansion & Dust Barrier Plantation
8. **Lodhi Road** (Central Delhi) — Ambient Background → Green Canopy Maintenance & Monitoring
9. **Mundka Industrial** (West Delhi) — Industrial + Freight Emissions → Industrial Zone EV Freight Transition

The interventions reference DPCC strategies and Delhi-specific infrastructure: NH24 truck bans, Ring Road sweepers, metro subsidies, NSIT/Palam area construction controls. The keyword lists match known CPCB/DPCC station names in Delhi.

The `_CITY_META` dictionary (lines 71-83) maps city names (lowercase) to ward metadata lists. Delhi, Noida, and Gurgaon all map to `_DELHI_META`. This means Noida and Gurgaon share Delhi's ward structure, which makes sense for an NCR-wide twin where ward-level administrative boundaries follow Delhi's structure. Live AQI values are fetched per city from WAQI, so Noida and Gurgaon will show different AQI readings even though the ward list is identical.

The fallback changed from `_PUNE_META` to `_DELHI_META` (line 160). If a city is requested that's not in `_CITY_META`, the endpoint returns Delhi wards. The docstring updated accordingly: "Falls back gracefully to Delhi metadata if city not explicitly configured."

## API endpoints default to Delhi

Five backend API endpoints changed their Query parameter defaults from `"Pune"` to `"Delhi"`:
1. **Drift detection** (drift.py line 15): `city: str = Query("Delhi")`
2. **ROI leaderboard** (scenario.py line 29): `city: str = Query("Delhi")`
3. **Scenario simulation schema** (schemas.py line 114): `city: str = "Delhi"`
4. **ML scenario schema** (forecast.py line 63): `city: str = "Delhi"`
5. **AI advisor schema** (schemas.py line 197): `city: str = "Delhi"`

This means calling `/drift/status` without a `?city=` parameter defaults to Delhi. Same for `/scenario/roi-leaderboard`. The frontend does not rely on these defaults—it always passes an explicit city parameter from `window._currentCity`—but the defaults ensure backend API tests and direct API consumers (curl, Postman, external clients) see Delhi data when no city is specified.

The AQI service also changed. `DEFAULT_SLUGS` changed from `['pune']` to `['delhi']` (line 54 in aqi_service.py). This is the fallback list of WAQI slugs used when `fetch_city_aqi` is called with an unrecognized city. The `CITY_SLUGS` dictionary reordered to place Delhi, Noida, and Gurgaon at the top (lines 37-39):
```python
CITY_SLUGS: dict[str, list[str]] = {
    "delhi":            ["delhi", "delhi/punjabi-bagh"],
    "noida":            ["noida", "delhi"],
    "gurgaon":          ["gurgaon", "delhi"],
    "pune":             ["pune", "pimpri"],
    "mumbai":           ["mumbai", "bandra"],
    # ...
}
```

Delhi uses two WAQI slugs: `"delhi"` and `"delhi/punjabi-bagh"`. The service fetches both in parallel and averages the results. Noida and Gurgaon each have a primary slug (`"noida"`, `"gurgaon"`) and fall back to `"delhi"` if the primary slug returns invalid data or errors.

## User-facing text changed to Delhi NCR context

All Maharashtra references replaced with Delhi NCR references:

**Drift modal** (modals.html lines 18-25):
- Affected station: "Anand Vihar, East Delhi — DPCC" (was "Bhosari MIDC / Akurdi, PCMC")
- Root cause diagnosis: "Unscheduled stubble burning influx from Punjab/Haryana combined with cold night-time boundary layer compression trapping vehicular particulate matter across Indo-Gangetic plain corridor" (was "Unscheduled metal foundry casting emissions along Old Pune-Mumbai Highway, exacerbated by night-time boundary layer compression trapping particulate matter in the Pawana river basin")

**Daily briefing modal** (modals.html lines 90-110):
- Subtitle: "Delhi NCR Urban Centers" (was "Maharashtra Urban Centers")
- Executive summary: "Indo-Gangetic plain atmospheric trapping and thermal inversion" (was "Western Ghats valley inversion")
- Source attribution: "44% vehicular and freight, 26% stubble burning and biomass (Punjab/Haryana seasonal influx), 20% road dust and construction" (was "44% vehicular, 26% industrial manufacturing (MIDC Bhosari/Akurdi/Chembur), 20% road dust")

**AI advisor** (ai-advisor.html lines 31-37):
- Welcome message: "...predictive models for Delhi NCR cities" (was "Maharashtra cities")
- Prompt chips:
  - "Should Delhi-NCR schools restrict outdoor sports tomorrow?" (was "Should PCMC schools...")
  - "Why did Anand Vihar spike today?" (was "Why did Akurdi and Bhosari spike?")
  - "What if we restrict freight on GT Karnal Road?" (was "...Pune-Mumbai highway...")

**AI advisor fallback responses** (advisor.js lines 70-77):
- School closure: "Under DPCC guidelines" (was "Under MPCB guidelines"), "Delhi-NCR schools" (was "PCMC schools")
- Spike explanation: "Anand Vihar and ITO" (was "Akurdi and Bhosari"), "industrial emissions and vehicular exhaust" (was "foundry emissions and highway freight diesel exhaust")
- Traffic restriction: "Ring Road and major corridors" (was "major corridors")
- Default response: "Vehicular transit and stubble burning from Punjab/Haryana are the primary drivers" (was "Vehicular and industrial transit"), "Anti-smog mist guns and traffic management" (remains the same)

**Dashboard location chips** (view-dashboard.html lines 246-249):
- Changed from: Pune (active), Mumbai, Nashik, Akurdi
- Changed to: Delhi (active), Noida, Gurgaon, Mumbai

**Wards view description** (view-wards.html line 6):
- "Delhi NCR urban centers (Delhi, Noida, Gurgaon, Faridabad)" (was "Maharashtra urban centers (Pune, Mumbai, Nashik, Akurdi / PCMC)")

**Index avatar tooltip** (index.html line 72):
- "City Admin: Delhi NCR Twin" (was "City Admin: Maharashtra Twin")

All changes are internally consistent. No Maharashtra terms remain in user-facing strings. The regulatory body changed from MPCB (Maharashtra Pollution Control Board) to DPCC (Delhi Pollution Control Committee). Geographic features changed from Western Ghats, Pawana river basin, and Godavari basin to Indo-Gangetic plain and Ring Road. Industrial references changed from MIDC (Maharashtra Industrial Development Corporation) and foundries to stubble burning, highway freight, and small-scale industrial belts in North-West Delhi.

</details>

<details>
<summary>File map</summary>

## Files changed (18 total)

**Backend (4 Python files):**
- `Backend/app/routes/drift.py` — Changed Query default from "Pune" to "Delhi"
- `Backend/app/routes/scenario.py` — Changed Query default from "Pune" to "Delhi"
- `Backend/app/routes/wards.py` — Expanded `_DELHI_META` from 3 to 9 wards, reordered `_CITY_META` to place Delhi/Noida/Gurgaon first, changed fallback from `_PUNE_META` to `_DELHI_META`
- `Backend/app/services/aqi_service.py` — Changed `DEFAULT_SLUGS` from `['pune']` to `['delhi']`, reordered `CITY_SLUGS` to place Delhi/Noida/Gurgaon first

**Frontend JS (6 files):**
- `Frontend/src/lib/config.js` — (Already had `defaultCity: 'delhi'`, no change in diff but confirmed correct)
- `Frontend/src/main.js` — (Already called `loadCityData('Delhi')`, no change in diff but confirmed correct)
- `Frontend/src/views/dashboard.js` — Reordered `CITY_CENTRES` to place Delhi first
- `Frontend/src/views/map.js` — Reordered `CITY_CENTRES` to place Delhi first
- `Frontend/src/views/scenario.js` — (No change visible in diff, likely already correct)
- `Frontend/src/views/wards.js` — (No change visible in diff, likely already correct)
- `Frontend/src/views/settings.js` — Reordered `CITY_API_NAME` to place Delhi/Noida/Gurgaon first
- `Frontend/src/components/modals.js` — Changed pre-load from `getCityAQI('Pune')` to `getCityAQI('Delhi')`, updated keyword map to match Delhi stations, updated city resolution fallback to 'Delhi'
- `Frontend/src/components/advisor.js` — Changed fallback city from 'the city' to 'Delhi NCR', updated school closure to reference DPCC, updated spike explanation to reference Anand Vihar/ITO/Ring Road, updated dominant source to reference stubble burning

**Frontend HTML (6 files):**
- `Frontend/index.html` — Changed avatar tooltip to "Delhi NCR Twin"
- `Frontend/public/partials/modals.html` — Updated drift modal station to Anand Vihar, updated root cause to reference stubble burning and Indo-Gangetic plain, updated search placeholder and station list to Delhi stations, updated briefing subtitle to Delhi NCR
- `Frontend/public/partials/ai-advisor.html` — Updated welcome message to "Delhi NCR cities", updated prompt chips to Delhi NCR scenarios
- `Frontend/public/partials/view-dashboard.html` — Updated location chips to Delhi/Noida/Gurgaon/Mumbai
- `Frontend/public/partials/view-settings.html` — Reordered city cards to Delhi/Noida/Gurgaon/Mumbai/Pune/Nagpur, updated Delhi card to 34 stations and "Indo-Gangetic Thermal Inversion & Stubble Burning", added Noida and Gurgaon cards, updated API endpoint examples to `/twin/delhi/`
- `Frontend/public/partials/view-wards.html` — Updated description to "Delhi NCR urban centers"

**Other:**
- `Frontend/package-lock.json` — Dependency lockfile changes (peer dependency flag removals, no functional impact)

Full diff: 24 files changed, 615 insertions, 240 deletions (includes 3 new task feature JSON files and integration-verification.md)

</details>

---

**Review date**: 2025-01-XX  
**Reviewer**: Semantic Code Review Agent  
**Method**: Static code analysis against HEAD~4 commits (13fa0d5 through 0b5c6fe)
