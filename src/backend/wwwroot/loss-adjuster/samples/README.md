# Loss Adjuster — Sample Input Documents

These sample contractor / repairer quotes are used by the Loss Adjuster
agent demo on `/agents/loss-adjuster`. They simulate three quotes returned
for the same kitchen water-damage loss (claim **CL-1001**) so Lara, the
Loss Adjuster Agent, can call the MCP tools to:

1. `analyzeQuote` — fetch and parse each quote.
2. `compareQuotes` — produce a markdown comparison table, a Mermaid
   bar-chart diagram of totals, and flagged anomalies (large total spread,
   missing line items, items priced more than 25% above the median).
3. `generateClaimExcel` — write an `.xlsx` workbook for the case.

| Vendor                  | Total (AUD) | Notes                                                             |
| ----------------------- | ----------: | ----------------------------------------------------------------- |
| Acme Restoration        |  $18,755.00 | Mid-priced, like-for-like replacement.                            |
| Bayside Build & Repair  |  $16,478.00 | Lowest, like-for-like. Excludes asbestos clearance.               |
| Sunrise Home Solutions  |  $33,044.00 | Premium-upgrade scope (2-pac cabinetry + stone benchtop upgrade). |

The agent should:

- Accept Acme and Bayside as in-scope replacement quotes.
- Flag Sunrise as **out-of-scope** (premium upgrade) and recommend it be
  handled as customer-funded betterment, not insurer-funded loss.
- Recommend a reserve close to the median of the in-scope quotes.

URLs (relative to the app root):

- `/loss-adjuster/samples/quote-acme-restoration.json`
- `/loss-adjuster/samples/quote-bayside-build.json`
- `/loss-adjuster/samples/quote-sunrise-home.json`
