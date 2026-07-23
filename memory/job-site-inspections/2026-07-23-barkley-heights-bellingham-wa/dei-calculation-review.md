# DEI Calculation Review - Preliminary Notes

These notes are a technical review aid for Dave. They are not field observations and are not a sealed engineering opinion. They are based on the uploaded DEI/Dibble Engineers PDF `D002`, primarily the 2026-07-09 structural review, DEI markups of Bradley's Lot 11/Lot 12 calculations, and visible extracted text from the DEI comparative calculation package.

## Scope

- Source reviewed: `D002` DEI/Dibble Engineers structural review PDF, 116 pages.
- Review focus requested by Dave: check whether DEI made mistakes or math/code errors in the structural calculations and review.
- Current status: preliminary internal-consistency review. A full engineering review still needs the original Bradley drawings/calculations, GeoTest/GeoEngineers geotechnical recommendations, DEI calculation package inputs in clean/native form, and applicable Bellingham/AHJ permit-code basis.

## Preliminary Findings

### F001 - DEI's correction of Bradley's HSS brace trigonometry appears correct

DEI criticizes Bradley for reducing the horizontal force by multiplying by `cos(65 deg)`. If the stated force is the horizontal component, the force along the inclined HSS brace should be:

`Reff = Rx / cos(65 deg)`

Using DEI's stated horizontal force:

- `Rx = 32.748 k`
- `cos(65 deg) = 0.4226`
- `Reff = 32.748 / 0.4226 = 77.49 k`

This matches DEI's stated `77.488 k`. Bradley's apparent `26 k x cos(65 deg) = 10.98 k` is not the correct transformation if the intent is to find the axial force in the brace from a horizontal component. DEI's criticism is mathematically well supported.

### F002 - DEI's active and seismic lateral-force arithmetic checks out for the stated retained heights

Using DEI's stated values:

- South/Lot 11 height: `18'-5 1/4" = 18.4375 ft`
- North/Lots 12-13 height: `14'-5 1/4" = 14.4375 ft`
- Active pressure: `35 pcf`
- Seismic surcharge: `12H psf`
- Tributary width: `8 ft`

Computed values:

- South active base pressure: `35 x 18.4375 = 645.31 psf`, matching DEI's `645.3 psf`.
- North active base pressure: `35 x 14.4375 = 505.31 psf`, matching DEI's `505.3 psf`.
- South active triangular resultant: `0.5 x 645.31 x 18.4375 x 8 / 1000 = 47.592 k`, matching DEI.
- North active triangular resultant: `0.5 x 505.31 x 14.4375 x 8 / 1000 = 29.182 k`, matching DEI.
- South `12H` seismic surcharge: `12 x 18.4375 = 221.25 psf`, matching DEI.
- North `12H` seismic surcharge: `12 x 14.4375 = 173.25 psf`, matching DEI.
- South seismic resultant: `221.25 x 18.4375 x 8 / 1000 = 32.634 k`, matching DEI.
- North seismic resultant: `173.25 x 14.4375 x 8 / 1000 = 20.010 k`, matching DEI.

DEI's arithmetic for the stated active and seismic loads appears internally consistent.

### F003 - DEI's "percent of load not accounted for" arithmetic generally checks out, with one apparent Lot 12 typo

For Lot 11, DEI states:

`(80.226 k - 3.500 k - 15.435 k) / 80.226 k = 61.291 / 80.226 = 76.4%`

This checks out.

For Lot 12, DEI states:

`TOTAL LOAD PER PILE = 29.182 k + 20.010 k = 49.192 k`

and then:

`(13.300 k + 20.010 k) / (80.226 k) = 33.310 k / 49.192 k = 0.677 = 67.7%`

The final value `67.7%` is correct if the denominator is `49.192 k`. The `80.226 k` denominator in the first line appears to be a carryover typo from the Lot 11 calculation, not a math-result error.

### F004 - DEI's concrete wall DCR values visible in the comparative calculations check out

Visible DEI comparative calculation values for the concrete wall:

- Configuration 1/Lot 11 shear: `Vu = 14.34 k`, `phi Vn = 5.92 k`; `14.34 / 5.92 = 2.422 = 242.2%`, matching DEI's `242.4%`.
- Configuration 1/Lot 11 bending: `Mu = 97.80 k-ft`, `phi Mn = 8.829 k-ft`; `97.80 / 8.829 = 11.08 = 1108%`, matching DEI's `1107.8%`.
- Configuration 2/Lots 12-13 shear: `Vu = 8.90 k`, `phi Vn = 5.92 k`; `8.90 / 5.92 = 1.503 = 150.3%`, matching DEI's `150.4%`.
- Configuration 2/Lots 12-13 bending: `Mu = 44.972 k-ft`, `phi Mn = 8.829 k-ft`; `44.972 / 8.829 = 5.093 = 509.3%`, matching DEI's `509.4%`.

Those DCR values appear arithmetically correct based on the visible DEI calculation output.

### F005 - DEI's statement about factors of safety has a wording problem

The DEI letter says: "The resulting factors of safety exceed the allowable factors of safety for either global sliding or overturning..."

That wording appears wrong. The concern is that the calculated factors of safety are below required/minimum values, not that they "exceed" them. The sentence should likely say the factors of safety "do not meet" the allowable/minimum factors of safety, or that the driving effects exceed resisting effects for certain checks.

DEI's table reports:

- South/Lot 11 global sliding: `0.887`
- South/Lot 11 global overturning: `1.289`
- North/Lots 12-13 global sliding: `1.222`
- North/Lots 12-13 global overturning: `0.747`

If the seismic minimum factor of safety is `1.10`, then south sliding and north overturning fail that threshold, while south overturning and north sliding exceed `1.10`. If the non-seismic threshold is `1.50`, all four listed values are below `1.50`, but the table is described as including seismic surcharge. This needs careful wording in any report.

### F006 - DEI's use of 2021 IBC / ASCE 7-16 appears facially aligned with the project calculation basis, but AHJ/current-code basis should be confirmed

DEI evaluates Bradley's design against 2021 IBC, ACI 318-19, ASCE 7-16, AISC 360-16, and NDS 2018. Bradley's own calculation cover/reference pages state 2021 IBC and related standards, so DEI's code-review basis appears facially consistent with Bradley's stated design basis.

Current/adopted code for the City of Bellingham and the applicable permit date should still be confirmed. The main code issue DEI raises - complete load path, equilibrium, stability, and strength design - is not a narrow edition-specific issue; it is a core structural requirement under any current IBC/ASCE framework.

### F007 - DEI's broad load-path criticism appears technically plausible and internally supported

DEI's main criticism is that Bradley separated or truncated load paths, omitting portions of active pressure, seismic surcharge, and reactions from the cantilevered pile above the concrete wall. Based on the marked-up pages:

- Lot 11 markup indicates a total per-pile load of `80.226 k` and states about `76.4%` was not accounted for in the specific Bradley analysis being criticized.
- Lot 12 markup indicates a total per-pile load of `49.192 k` and states about `67.7%` was not accounted for.
- DEI identifies reactions from the wide flange pile above the lower concrete wall that were not included in the concrete retaining wall analysis.
- DEI identifies the concrete footing as lacking transverse reinforcing and therefore not being a reliable overturning-resisting element for the wall above.

Those criticisms are directionally consistent with IBC/ASCE/ACI load-path and equilibrium requirements. They should be independently checked against the actual intended structural system, drawings, and any contractor-installed grout block or other restraint that Bradley may have intended to rely on.

## Potential DEI Errors / Weak Spots To Follow Up

- The Lot 12 percent-unaccounted calculation has an apparent denominator typo: it should use `49.192 k`, not `80.226 k`.
- The DEI narrative says factors of safety "exceed" allowable factors; this appears to be a wording error and should be corrected or clarified.
- The summary table collapses multiple configurations/lots into "South" and "North"; the calculation package includes Configuration 1, 2, and 3. Confirm exactly which configuration values feed each summary-table value.
- DEI's global stability and pile-sizing results rely on selected software inputs, soil parameters, surcharge assumptions, and passive resistance assumptions. The input assumptions need verification against the GeoTest report, GeoEngineers memorandum, and site-specific geometry.
- DEI states the grout block was excluded from the comparative analysis because it was not part of Bradley's analysis, then included in the retrofit design. For any causation or adequacy opinion, confirm whether the installed grout block existed at the relevant time and whether it materially changes the existing-wall stability.
- DEI says residence retaining walls cannot be relied on to restrain embedded pile portions because they were not designed for additional surcharge. That is a reasonable caution, but it should be verified against the AG Consulting residence structural drawings and any actual load path/geometry between the walls.
- The ASCE hazard pages note default Site Class D and possible ground motion hazard analysis under ASCE 7-16 Section 11.4.8. Confirm whether the geotechnical report provides site class and seismic earth pressure recommendations controlling over the default hazard-tool output.

## Preliminary Bottom Line

I did not find an obvious arithmetic error that undermines DEI's main criticisms in the visible calculations. The key DEI arithmetic I checked generally matches the stated values.

The two clear issues I found in DEI's own report are presentation/wording problems:

1. A Lot 12 denominator typo in the percent-unaccounted calculation, though the final percentage is correct.
2. A likely wrong-word sentence saying factors of safety "exceed" allowable values, where the intended criticism is that some factors of safety are below required/minimum values.

The engineering thrust of DEI's review - missing seismic surcharge, incomplete load path/equilibrium, overstressed concrete wall/pile components, and deficient brace force transformation - appears technically plausible and mathematically supported by the extracted material. Full confirmation requires checking the source drawings, geotechnical assumptions, and complete software calculation inputs.
