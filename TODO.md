# AGENTS: IGNORE UNLESS INSTRUCTED TO USE THIS FILE

# TO DO LIST

## CHANGES:
- get defaults right
- transactions filteing needs improvement


## NEW FEATUES:
- explore the idea of transfer categories
- AI categorization
- FI number and year-by-year projection using live burn rate data.
- Better PWA support
- AI Financial fitness evaluation
- backup and restore
- per user encryption
- Vuln patch


## BUGS:
- some charts include excluded accounts (snakey, spending breakdown at the least)
- cash flow forecast should only include banking accounts
- idea of tags



[DONE] Snakey issues:
 - Cannot move forward to current month
 - Colors too dark and barely visible in dark mode
 - I want to be able to click on any input or output on the snake and go to the transactions page with the right filters applied to see the transactions matching that snakey input or output

[DONE]Show the Math
 - In the settings > analytics area, create a feature called "Show the Math", that when toggled on, describes the logic used to create every analytics card. Meaning, for something like net worth it would explain that the figure was calculated using Assets-Liabilities.
 - Investigate the logic used for each card, then, when this feature is enabled add a description of the logic and math below the card. 
 - Don't guess the logic, actually look at the code for each card and describe the real logic and math being used to generate the card data. 

[DONE] Cash Flow > Cash Flow Forecast > Chart loads now but the lines do not render on the chart. 

[DONE] [ELEMENT DOESNT RENDER "Failed to fetch categories
"] In Cash Flow > Category Breakdown all of the columns and the trendlines need a label so the user knows what the data is.

[DONE] [ELEMENT DOESNT RENDER "Failed to fetch categories
"] Make sure that "uncategorized" is a valid option to select in In Cash Flow > Spending Breakdown

[DONE] [ELEMENT DOESNT RENDER "Failed to fetch categories
"] Make sure that "uncategorized" appears in Cash Flow > Category Breakdown

[DONE] [ELEMENT DOESNT RENDER "Failed to fetch categories
"] In Cash Flow > Spending Breakdown bar labels need to be removed form bar charts. The y axis labels don't fit, so remove the adjacent Budget vs Actual chart and make Spending Breakdown full width. In Spending Breakdown, once a label pill is clicked it disappears and there is no way to bring it back. Make them stay and be saturated when the category is selected, and muted when it isn't. The categories that appear should mirror those that are present in the selected timeframe. The pie chart should have a legend.

[DONE] In settings > Navigation, remove settings as a toggle that can be turned off. The user should be able to turn off settings

[DONE] In Settings > Analytics > Synthetic & Estimated Data put a BETA disclaimer by each toggle and warn that the feature is under development and data may not be accurate. Check that these settings are off by default. 

[DONE] In Budgets > Budget vs Actual, add an option/checkbox to "Exclude Income"

[DONE] In Budgets > Budget vs Actual, remove the bar labels from the bars, keep the axis labels. 

[DONE] In FIRE > Forecaster > Portfolio Projection, add tool tip to the chart to see values. Same for Real Estate > Mortgage Paydown

[DONE] There is an error in the logic of the Real Estate > Mortgage Paydown > Extra Payment Calculator. The calculator seems to increase the interest and payoff date, not decrease it. 

[DONE] In settings > Chart Color Scheme add three more color schemes. 

[DONE] Cash Flow > Income vs Expenses bar chart needs bar labels removed. 

[DONE] Cash Flow > Net Income Analysis bar chart needs bar labels removed. The chart also needs to handle negative numbers properly--the y axis needs to go negative if the data needs it. 

[DONE]On the accounts side panel, make the account names slightly less indented, so they line up with the account type subheading carrot. Also reduce he vertical padding slightly 


[DONE] In the Real estate > Portfolio Allocation area, if a mortgage is linked to the asset, share the area with diagonal lines or texture  in the pie chart that is mortgaged and indicate as such on the legend. 

[DONE] In Real estate, get rid of the "Value History (12mo)" form the real estate card. 

[DONE] In the Real estate > Mortgage Paydown area, always have the x Avis cover the entire length of the loan. Make sure the x axis labels do not overlap in the UI.

[DONE] In FIRE > Forecaster > Portfolio Projection, the x axis labels overlap and are unreadable. 

[DONE] In Settings > Accounts > Manual Accounts manually added mortgages need and Adjust options (like gold/silver) so the outstanding balance can be adjusted.

