# Submarine Orchestration Simulator

An interactive React experience for configuring a submarine crew, assigning mission tasks, and reviewing how the crew's collective reasoning unfolds in the ship's log. Use the low-code interface to add specialists, tailor instructions, link teams in a chain of command, and visualise activity on a stylised 2D submarine layout.

## Getting started

```bash
npm install
npm run dev
```

Then open the provided local URL (usually `http://localhost:5173`) in your browser.

## Available views

- **Crew & Roles** – Maintain the crew manifest, edit directives, and monitor which missions each person supports.
- **Mission Tasks** – Create or advance operational tasks, assign crew members, and capture reasoning for each directive.
- **Chain of Command** – Group crew into functional teams and explore how compartments and tasks intersect.
- **Configuration Guide** – Reference amenities and active workstreams for every compartment on the submarine.
- **Ship's Log** – Review the automatically captured narrative of coordination decisions and outcomes.

Every change made to crew structure, tasking, or team composition contributes an entry to the ship's log so that after-action reviews can quickly surface what influenced mission success.
