# Calendar

The **calendar** is the slot’s time grid: how long each **period** lasts and when
period 0 starts.

- **Period length** — usually one day (86400 seconds). Periods do not overlap.
- **First period start** — Unix time of period 0. Later periods follow the grid.

Replacing a calendar **bumps the version**. You cannot replace a calendar while
**leases** are still outstanding on the current one.

Periods exist after this step, but they are not sellable until you set
[terms](terms.md).
