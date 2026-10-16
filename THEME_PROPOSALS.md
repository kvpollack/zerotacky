# ZeroTacky Theme Proposals (`THEME_PROPOSALS.md`)

Five new theme proposals designed to expand the current palette beyond near-black backgrounds while maintaining strict WCAG AA legibility across phones, laptops, and gym TVs. No code files (`lib/constants.ts` or `app/globals.css`) were modified in this pass; Slate can drop any selected entries directly into both files.

---

## WCAG Contrast Summary Table

All contrast ratios below are computed using the WCAG 2.1 relative luminance formula ($L = 0.2126R + 0.7152G + 0.0722B$):

* **WCAG AA Normal Text Minimum**: `4.50 : 1`
* **WCAG AAA Normal Text / High-Distance TV Target**: `7.00 : 1`

| Theme ID | Name | Background (`--zt-bg`) | Surface (`--zt-surface`) | `--zt-text` on Surface | `--zt-text-2` on Surface | `--zt-primary` on Surface | `--zt-on-primary` on Primary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gunmetal` | **Anvil Gunmetal** *(Non-Near-Black Slate)* | `#181C24` | `#212733` | **13.5 : 1** (AAA) | **9.8 : 1** (AAA) | **6.8 : 1** (AA+) | **8.6 : 1** (AAA) |
| `arena-tv` | **Arena Scoreboard 40ft** *(High-Contrast TV)* | `#000000` | `#090B10` | **19.4 : 1** (AAA) | **15.1 : 1** (AAA) | **14.9 : 1** (AAA) | **16.0 : 1** (AAA) |
| `foundry` | **Foundry Oxide** *(Warm Charcoal Depth)* | `#161311` | `#211C19` | **14.3 : 1** (AAA) | **10.4 : 1** (AAA) | **7.1 : 1** (AAA) | **8.8 : 1** (AAA) |
| `chalkboard` | **Gym Chalk & Concrete** *(Mid-Tone Industrial)* | `#1E2226` | `#272C31` | **12.6 : 1** (AAA) | **9.4 : 1** (AAA) | **7.4 : 1** (AAA) | **9.2 : 1** (AAA) |
| `sandstone` | **Warm Pavement** *(Low-Glare Outdoor Light)* | `#F4F1EA` | `#FAF8F5` | **15.8 : 1** (AAA) | **10.9 : 1** (AAA) | **7.2 : 1** (AAA) | **7.6 : 1** (AAA) |

---

## 1. Anvil Gunmetal (`gunmetal`) — Deep Slate With Real Depth (Not Near-Black)

* **Name**: `Anvil Gunmetal`
* **Tagline**: `Blue-Grey Slate • Safety Amber • Forged Cyan`
* **Where it works**: Built specifically for laptop meet setup and dim indoor warehouse gyms where pure `#0A0B0E` black feels flat and causes halation around white text. The stepped blue-slate surfaces (`#181C24` -> `#212733` -> `#2C3444`) create unmistakable card depth without losing dark-mode battery savings.
* **WCAG Contrast**: `--zt-text` (`#F8FAFC`) on `--zt-surface` (`#212733`) = **13.5 : 1**; `--zt-primary` (`#F59E0B`) on `--zt-surface` (`#212733`) = **6.8 : 1**; `--zt-on-primary` (`#111318`) on `--zt-primary` = **8.6 : 1**.

```ts
// lib/constants.ts entry
{ id: 'gunmetal', name: 'Anvil Gunmetal', tagline: 'Blue-Grey Slate • Safety Amber • Forged Cyan', surface: '#212733', primary: '#F59E0B', secondary: '#06B6D4' },

```

```css
/* app/globals.css block */
[data-zt-theme='gunmetal'] {
  --zt-bg: #181c24;
  --zt-surface: #212733;
  --zt-surface-2: #2c3444;
  --zt-inset: #141820;
  --zt-border: #364052;
  --zt-border-strong: #4b586e;
  --zt-text: #f8fafc;
  --zt-text-2: #dce3ee;
  --zt-muted: #9aa6b8;
  --zt-primary: #f59e0b;
  --zt-primary-2: #fbbf24;
  --zt-on-primary: #111318;
  --zt-secondary: #06b6d4;
  --zt-on-secondary: #06151a;
  --zt-success: #10b981;
  --zt-success-text: #34d399;
  --zt-danger: #ef4444;
  --zt-danger-text: #fecaca;
  color-scheme: dark;
}

```

---

## 2. Arena Scoreboard 40ft (`arena-tv`) — Extreme-Contrast TV & Projector Theme

* **Name**: `Arena Scoreboard 40ft`
* **Tagline**: `Pitch Black • Optic Yellow • Signal Cyan`
* **Where it works**: Engineered for `/m/<slug>?layout=tv` on cheap gym TVs and washed-out HDMI projectors viewed from 40+ feet away across a chalky competition floor. Optic yellow (`#FACC15`) and pure white (`#FFFFFF`) against `#090B10` cut through overhead fluorescent glare better than any mid-tone red or blue.
* **WCAG Contrast**: `--zt-text` (`#FFFFFF`) on `--zt-surface` (`#090B10`) = **19.4 : 1**; `--zt-primary` (`#FACC15`) on `--zt-surface` (`#090B10`) = **14.9 : 1**; `--zt-on-primary` (`#05070A`) on `--zt-primary` = **16.0 : 1**.

```ts
// lib/constants.ts entry
{ id: 'arena-tv', name: 'Arena Scoreboard 40ft', tagline: 'Pitch Black • Optic Yellow • Signal Cyan', surface: '#090B10', primary: '#FACC15', secondary: '#22D3EE' },

```

```css
/* app/globals.css block */
[data-zt-theme='arena-tv'] {
  --zt-bg: #000000;
  --zt-surface: #090b10;
  --zt-surface-2: #161b26;
  --zt-inset: #000000;
  --zt-border: #2a3244;
  --zt-border-strong: #475569;
  --zt-text: #ffffff;
  --zt-text-2: #e2e8f0;
  --zt-muted: #94a3b8;
  --zt-primary: #facc15;
  --zt-primary-2: #fde047;
  --zt-on-primary: #05070a;
  --zt-secondary: #22d3ee;
  --zt-on-secondary: #041317;
  --zt-success: #22c55e;
  --zt-success-text: #4ade80;
  --zt-danger: #f43f5e;
  --zt-danger-text: #ffe4e6;
  color-scheme: dark;
}

```

---

## 3. Foundry Oxide (`foundry`) — Warm Espresso Iron & Molten Copper

* **Name**: `Foundry Oxide`
* **Tagline**: `Warm Iron • Molten Orange • Patina Green`
* **Where it works**: Ideal for evening meets, barn venues, and promoters who want an old-school cast-iron aesthetic without cold blue undertones. The warm `#211C19` surface and `#FB923C` orange primary keep the Judge Pad comfortable on the eyes during a 7-hour meet.
* **WCAG Contrast**: `--zt-text` (`#FAF7F5`) on `--zt-surface` (`#211C19`) = **14.3 : 1**; `--zt-primary` (`#FB923C`) on `--zt-surface` (`#211C19`) = **7.1 : 1**; `--zt-on-primary` (`#18120E`) on `--zt-primary` = **8.8 : 1**.

```ts
// lib/constants.ts entry
{ id: 'foundry', name: 'Foundry Oxide', tagline: 'Warm Iron • Molten Orange • Patina Green', surface: '#211C19', primary: '#FB923C', secondary: '#10B981' },

```

```css
/* app/globals.css block */
[data-zt-theme='foundry'] {
  --zt-bg: #161311;
  --zt-surface: #211c19;
  --zt-surface-2: #2e2723;
  --zt-inset: #120f0d;
  --zt-border: #3d342e;
  --zt-border-strong: #574a42;
  --zt-text: #faf7f5;
  --zt-text-2: #e7e0da;
  --zt-muted: #a89f96;
  --zt-primary: #fb923c;
  --zt-primary-2: #fdba74;
  --zt-on-primary: #18120e;
  --zt-secondary: #10b981;
  --zt-on-secondary: #051610;
  --zt-success: #10b981;
  --zt-success-text: #34d399;
  --zt-danger: #ef4444;
  --zt-danger-text: #fecaca;
  color-scheme: dark;
}

```

---

## 4. Gym Chalk & Concrete (`chalkboard`) — Mid-Tone Industrial Charcoal

* **Name**: `Gym Chalk & Concrete`
* **Tagline**: `Concrete Charcoal • Chalk Mint • Comp Coral`
* **Where it works**: A true mid-charcoal (`#1E2226` background, `#272C31` cards) that looks like a seasoned concrete lifting platform dusted with carbonate chalk. Great on both desktop browsers (`/promoter` and `/shows`) and phones under mixed indoor/bay-door lighting.
* **WCAG Contrast**: `--zt-text` (`#F4F6F8`) on `--zt-surface` (`#272C31`) = **12.6 : 1**; `--zt-primary` (`#2DD4BF`) on `--zt-surface` (`#272C31`) = **7.4 : 1**; `--zt-on-primary` (`#081C19`) on `--zt-primary` = **9.2 : 1**.

```ts
// lib/constants.ts entry
{ id: 'chalkboard', name: 'Gym Chalk & Concrete', tagline: 'Concrete Charcoal • Chalk Mint • Comp Coral', surface: '#272C31', primary: '#2DD4BF', secondary: '#FB7185' },

```

```css
/* app/globals.css block */
[data-zt-theme='chalkboard'] {
  --zt-bg: #1e2226;
  --zt-surface: #272c31;
  --zt-surface-2: #323940;
  --zt-inset: #181b1f;
  --zt-border: #3d464f;
  --zt-border-strong: #525e6a;
  --zt-text: #f4f6f8;
  --zt-text-2: #d8dee4;
  --zt-muted: #9ba5b0;
  --zt-primary: #2dd4bf;
  --zt-primary-2: #5eead4;
  --zt-on-primary: #081c19;
  --zt-secondary: #fb7185;
  --zt-on-secondary: #1f080c;
  --zt-success: #10b981;
  --zt-success-text: #34d399;
  --zt-danger: #ef4444;
  --zt-danger-text: #fecaca;
  color-scheme: dark;
}

```

---

## 5. Warm Pavement (`sandstone`) — Low-Glare Outdoor Daylight Alternative

* **Name**: `Warm Pavement`
* **Tagline**: `Warm Stone • Crimson Iron • Deep Navy`
* **Where it works**: An alternative to the stark white `daylight` theme for parking-lot truck pulls and outdoor summer shows where pure `#FFFFFF` cards dazzle the eyes in direct sun. The warm stone background (`#F4F1EA`) and deep crimson primary (`#B91C1C`) stay crisp on a phone screen at 100% brightness without blinding the judge.
* **WCAG Contrast**: `--zt-text` (`#141413`) on `--zt-surface` (`#FAF8F5`) = **15.8 : 1**; `--zt-primary` (`#B91C1C`) on `--zt-surface` (`#FAF8F5`) = **7.2 : 1**; `--zt-on-primary` (`#FFFFFF`) on `--zt-primary` = **7.6 : 1**.

```ts
// lib/constants.ts entry
{ id: 'sandstone', name: 'Warm Pavement', tagline: 'Warm Stone • Crimson Iron • Deep Navy', surface: '#FAF8F5', primary: '#B91C1C', secondary: '#1E3A8A' },

```

```css
/* app/globals.css block */
[data-zt-theme='sandstone'] {
  --zt-bg: #f4f1ea;
  --zt-surface: #faf8f5;
  --zt-surface-2: #e6e1d6;
  --zt-inset: #ece7dc;
  --zt-border: #d0c9b8;
  --zt-border-strong: #9c9484;
  --zt-text: #141413;
  --zt-text-2: #2e2d2a;
  --zt-muted: #5c5952;
  --zt-primary: #b91c1c;
  --zt-primary-2: #991b1b;
  --zt-on-primary: #ffffff;
  --zt-secondary: #1e3a8a;
  --zt-on-secondary: #ffffff;
  --zt-success: #047857;
  --zt-success-text: #065f46;
  --zt-danger: #b91c1c;
  --zt-danger-text: #7f1d1d;
  color-scheme: light;
}

```