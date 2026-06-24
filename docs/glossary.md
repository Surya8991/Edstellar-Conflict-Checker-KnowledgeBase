# Domain Glossary

Terms used throughout the conflict checker and this knowledge base.

| Term | Definition |
|------|------------|
| **Trainer** | An individual instructor in Edstellar's network, qualified to deliver one or more courses. Has a home timezone, availability calendar, and competency tags. |
| **Course** | A catalog item (e.g. "AWS Solutions Architect Associate", "Crucial Conversations"). Has a duration in hours/days and a list of qualified trainers. |
| **Training Request (TR)** | A client's ask: "deliver Course X to N learners between dates A and B in mode Y". State machine: `Draft → Submitted → Trainer-Assigned → Confirmed → In-Delivery → Completed`. |
| **Batch** | A scheduled, trainer-assigned instance of a course for a specific client cohort. Has start/end datetimes (with timezone), a trainer, a mode (ILT/VILT), and a location (city for ILT, meeting URL for VILT). |
| **Session** | A single contiguous time window within a batch (a multi-day batch has multiple sessions). Conflicts are checked at the session level, not the batch level. |
| **Buffer** | Pre/post session time reserved for trainer prep, travel, or back-to-back recovery. Configurable per mode (default: 30 min VILT, half-day for ILT travel days). |
| **Blackout** | Trainer-declared unavailable window (PTO, personal, public holiday). Treated as a hard conflict. |
| **Soft Conflict** | A warning the booker can override (e.g. <2 hr gap between VILT sessions). |
| **Hard Conflict** | A blocker the booker cannot override (e.g. overlapping sessions). |
| **Competency Match** | Trainer has the required certification / skill tag for the course. Missing competency = hard conflict. |
| **Timezone** | All datetimes are stored in UTC and rendered per viewer locale. Conflict math always runs in UTC. |
