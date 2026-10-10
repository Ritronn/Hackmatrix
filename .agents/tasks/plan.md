# Implementation Plan: Delhi NCR Migration

This plan migrates the Hackmatrix digital twin from Pune (Maharashtra) defaults to Delhi NCR defaults. All changes are additive and non-breaking. The ML model is already trained on Delhi CPCB data.

## Feature 1: Frontend JavaScript Migration to Delhi NCR

- [ ] 1. Update frontend JavaScript configuration and view files to default to Delhi NCR.
      
      **Files:**
      - `Frontend/src/lib/config.js` (line 15: verify defaultCity is 'delhi')
      - `Frontend/src/main.js` (line 40: verify loadCityData('Delhi'))
      - `Frontend/src/views/dashboard.js` (lines 24-33: reorder CITY_CENTRES with delhi first; line 180: verify loadCityData default is 'Delhi')
      - `Frontend/src/views/map.js` (lines 24-33: reorder CITY_CENTRES; line 60: verify initMap default 'delhi'; line 179: verify loadStationData default 'Delhi')
      - `Frontend/src/views/scenario.js` (lines 72, 197: verify Delhi defaults)
      - `Frontend/src/views/wards.js` (line 58: verify loadWards default 'Delhi')
      - `Frontend/src/views/settings.js` (lines 16-26: reorder CITY_API_NAME with delhi, noida, gurgaon first)
      - `Frontend/src/components/modals.js` (lines 74-102: update kwMap to Delhi stations - anand: ['Anand Vihar', 'Kaushambi', 'Patparganj'], ito: ['ITO', 'Pragati Maidan', 'Mandi House'], dwarka: ['Dwarka', 'NSIT', 'Palam'], lodhi: ['Lodhi', 'Safdarjung', 'JLN']; line 172: update briefing fallback to Delhi NCR)
      - `Frontend/src/components/advisor.js` (lines 85-92: update fallback to Delhi NCR context with DPCC, Anand Vihar, Ring Road; line 124: update context_dominant_source to 'Vehicular transit, Stubble burning (Punjab/Haryana seasonal), Industrial (North-West belt), Road dust')
      
      **Changes:**
      - Reorder CITY_CENTRES objects in dashboard.js and map.js to list delhi first, followed by noida, gurgaon, then pune, mumbai, others
      - Update settings.js CITY_API_NAME to prioritize delhi, noida, gurgaon
      - Update modals.js search station keywords to Delhi NCR stations (Anand Vihar, ITO, Dwarka, Lodhi Road)
      - Update advisor.js fallback responses to reference Delhi NCR (DPCC guidelines, stubble burning, Ring Road)
      
      **Verify:**
      ```bash
      cd Frontend
      npm run dev
      ```
      Open http://localhost:5173 and verify:
      - Hero card shows Delhi as default
      - Map centers on Delhi (77.2090, 28.6139)
      - City search modal lists Delhi stations
      - AI Advisor mentions Delhi NCR context

## Feature 2: Frontend HTML Partials Migration to Delhi NCR

- [ ] 2. Update frontend HTML partial templates to reference Delhi NCR cities and stations.
      
      **Files:**
      - `Frontend/index.html` (line 69: verify avatar tooltip 'City Admin: Delhi NCR Twin')
      - `Frontend/public/partials/modals.html` (lines 30-34: verify drift modal Anand Vihar; lines 39-58: update search items to Anand Vihar/ITO/Dwarka/Lodhi Road with Delhi zone descriptions; line 47: verify root cause mentions Punjab/Haryana; line 99: verify Delhi NCR)
      - `Frontend/public/partials/ai-advisor.html` (line 13: verify subtitle; lines 35-37: update prompt chips to 'Should Delhi-NCR schools restrict...', 'Why did Anand Vihar and Wazirpur spike...', 'What happens if we restrict freight on GT Karnal Road and Ring Road...')
      - `Frontend/public/partials/view-dashboard.html` (lines 157-160: replace location chips with Delhi, Noida, Gurgaon, Mumbai)
      - `Frontend/public/partials/view-settings.html` (line 15: verify Delhi active; lines 20-30: add Noida and Gurgaon cards after Delhi; line 16: update Delhi meta to 34 stations & Indo-Gangetic description; lines 47-48: change API examples from /twin/pune/ to /twin/delhi/)
      - `Frontend/public/partials/view-wards.html` (line 5: verify description mentions Delhi NCR)
      
      **Changes:**
      - Replace modals.html search station items with Delhi NCR stations (Anand Vihar, ITO Junction, Dwarka Sector 8, Lodhi Road)
      - Update ai-advisor.html prompt chips to Delhi NCR scenarios (schools, Anand Vihar spike, GT Karnal Road)
      - Replace view-dashboard.html location chips (remove Pune/Akurdi/Nashik, add Delhi/Noida/Gurgaon/Mumbai)
      - Add Noida and Gurgaon city cards to view-settings.html
      - Update API endpoint examples from /twin/pune/ to /twin/delhi/
      
      **Verify:**
      ```bash
      cd Frontend
      npm run dev
      ```
      Open http://localhost:5173 and verify:
      - Avatar tooltip shows 'Delhi NCR Twin'
      - Search modal lists Delhi stations
      - AI Advisor chips reference Delhi scenarios
      - Dashboard chips show Delhi, Noida, Gurgaon, Mumbai
      - Settings shows Delhi as Active Twin with Noida/Gurgaon cards
      - API examples use /twin/delhi/ paths

## Feature 3: Backend Python Migration to Delhi NCR

- [ ] 3. Update backend Python services and routes to prioritize Delhi NCR data.
      
      **Files:**
      - `Backend/app/services/aqi_service.py` (line 36: verify DEFAULT_SLUGS ['delhi']; lines 41-61: reorder CITY_SLUGS with delhi, noida, gurgaon at top; lines 42-44: verify delhi: ['delhi', 'delhi/punjabi-bagh'], noida: ['noida', 'delhi'], gurgaon: ['gurgaon', 'delhi'])
      - `Backend/app/routes/wards.py` (lines 30-38: expand _DELHI_META from 3 to 9 entries: Anand Vihar, ITO Junction, Wazirpur Industrial, R K Puram, Dwarka Sector 8, Punjabi Bagh, Rohini Sector 16, Lodhi Road, Mundka Industrial; line 95: change fallback to _DELHI_META)
      - `Backend/app/routes/scenario.py` (line 20: verify city Query default 'Delhi')
      - `Backend/app/routes/drift.py` (line 18: verify city Query default 'Delhi')
      
      **Changes:**
      - Set DEFAULT_SLUGS to ['delhi']
      - Reorder CITY_SLUGS to prioritize delhi, noida, gurgaon
      - Expand _DELHI_META to 9 wards with DPCC-aligned interventions:
        - Anand Vihar (East Delhi, Transport Hub + Stubble, Mist Cannons + Truck Ban)
        - ITO Junction (Central Delhi, Traffic Congestion, Signal Sync + Metro Subsidy)
        - Wazirpur Industrial (North West Delhi, Industrial Emissions, Stack Scrubber Audit)
        - R K Puram (South Delhi, Ring Road Vehicular, Heavy Vehicle Diversion)
        - Dwarka Sector 8 (South West Delhi, Construction Dust, Site Enclosures)
        - Punjabi Bagh (West Delhi, Highway Traffic, Vacuum Sweepers)
        - Rohini Sector 16 (North Delhi, Construction + Dust, Green Belt)
        - Lodhi Road (Central Delhi, Ambient Background, Canopy Maintenance)
        - Mundka Industrial (West Delhi, Industrial + Freight, EV Transition)
      - Change _CITY_META fallback from _PUNE_META to _DELHI_META
      
      **Verify:**
      ```bash
      cd Backend
      uvicorn main:app --reload --port 8000
      ```
      Test endpoints:
      ```bash
      curl http://localhost:8000/twin/Delhi/current
      curl http://localhost:8000/wards/Delhi
      curl http://localhost:8000/scenario/roi-leaderboard
      curl http://localhost:8000/drift/status
      curl http://localhost:8000/twin/Noida/current
      curl http://localhost:8000/twin/Gurgaon/current
      ```
      Verify:
      - /twin/Delhi/current returns Delhi stations
      - /wards/Delhi returns 9 wards with Delhi zones
      - /scenario/roi-leaderboard defaults to Delhi
      - /drift/status defaults to Delhi
      - Noida and Gurgaon endpoints return correct data

## Summary

This plan updates 18 files across frontend and backend:
- **Frontend JS (9 files):** config.js, main.js, dashboard.js, map.js, scenario.js, wards.js, settings.js, modals.js, advisor.js
- **Frontend HTML (6 files):** index.html, modals.html, ai-advisor.html, view-dashboard.html, view-settings.html, view-wards.html
- **Backend Python (4 files):** aqi_service.py, wards.py, scenario.py, drift.py

All changes prioritize Delhi NCR (Delhi, Noida, Gurgaon) while maintaining backward compatibility with Pune, Mumbai, and other cities. No breaking changes to API contracts or data structures.
