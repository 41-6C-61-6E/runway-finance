# AGENTS: IGNORE UNLESS INSTRUCTED TO USE THIS FILE

# TO DO LIST

## CHANGES:
- Spending Breakdown pi and bar charts should actually use the category colors (or versions of them depending on theme) rather than the color scheme colors. 

## NEW FEATUES:
- explore the idea of transfer categories, paired tx or tags
- Better PWA support
- Vuln patch







- Currently there is no way to capture 401k match, tax withholding, other paycheck deductions (union dues, cafeteria, insurance) to be used in the analytics. Think about this wholistically and plan for other areas of the app that may also need to reflect these changes. Understand the schema. There may need to be a manual transaction type feature. Where would it make sense to solicit this data form the user and incorporate it? Possibly a rule the triggers when a paycheck is detected and then the witholdings are auto created or somehting like that. Help me witht he logic and flow. make some proposals and ask quesitons. 

- investments page with holdings and other metrics
- screen grab projection lab and do that stuff

## BUGS:

- real estate patoff chart - make sure the x axis shows the totality of both ilines

- [DONE] There is an issue with the way the manual and simpleFIN syncs are happening. Investigate and fix. Ideally the user does not have to log in first and the syncs will start for all users when the server starts. There is an encryption key in the env that should be able to start the syncs without the user logging in.


- [DONE] hover colors in the nav bar of the moonlight theme need to be handled similar to dark mode so the text is readable when the mosue moved over the nav bar items. 

- [DONE] health acccount handling should not in its own group, there should be Investments > HSA Account and Checking > HSA Account
- [DONE] bulk edit of categeories does not work on transacitons page. THe category doesnt actually change. 
-  [DONE] if AI suggestion sets a category, then the user sets it later to something else, the AI sparkles should go away, but it doesnt.

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

- [DONE]Make a defaults/config file where all the settings, API keys, and anything else in the projects that is configurable can be pre set upon deployment and onboarding of new users. Once the user changes a setting, store their preference. But for new users the defaults file should be used to populate the settings. Remove the existing APIs tab from settings and replace it with an Advanced tab on the right and have this be a key value listing of all the possible settings that the user can change. Warn the user at the top that changing these settings could cause unexpected behavior. Think about this wholistically and plan for other areas of the app that may also need to reflect these changes.

- [DONE] Add data explorer and financial logic to the dev mode toggel. remove the dev logging feature. When dev mode is off Financial Logic and Data explorer should not show up in the Nav bar. Think about this wholistically and plan for other areas of the app that may also need to reflect these changes.

- [DONE] add a SimpeFIN sync frequency setting configurable in the settings area and show when the next sync is scheduled to occur. A previous agent worked on the problem so you may find remnants to use or clean up. 

- [DONE] In manual accounts, Mortgages that are synced with SimpleFIN show up--this is correct, but put a label that the account is SIimpleFIN synced. ALso in the edit drawer for mortgage accounts, add support for broken out extra principal, prinicpal, interest, PMI, escrow(taxes, insurance) and then make sure that these values populate into the relevane charts in the real estate page. think through the logic and what might need to change on the real estate page. Think about this wholistically and plan for other areas of the app that may also need to reflect these changes.

- [DONE] Add a backup and restore feature where the user can download or restore all data and settings in a backup file or have the option to export all financial data as a set of csv files or json or whatever makes sense. This featue will be in the advanced settings tab. Think about this wholistically and plan for other areas of the app that may also need to reflect these changes.

- [DONE] Implement a Stacked volume line chart for net worth line chart on the dashboard. The net worth line chart should show shaded stacked acccoutn types using the same colors in the "Breakdown" pie chart. For example Assets should show as stacked volume of real estate, retirement, savings, etc. and liabilities should subract from the volume for loans, credit, etc.

- [DONE] Plan an accounts page with account balance over time. A previous agent worked on an accounts page but it was not fully finished, so you may run into some remnants of that and need to do some cleanup. The accounts page should have a stacked volume line chart showing account balance over time and should be filterable by accounts, or account type or group type so that the chart updated based on the filtered accounts. There should also be an option to select a bar chart that will show the same data but in stacked bars (showing each account or acount group or type). Below the chart should be an tree like expandable area showing every account, expandable by group and type, and with relevant statistics about that account, like balance trend, a little simple history chart indicator for just that account, recent activity, etc or whatever makes sense to show. Make sure to update Nav bar and other areas of the project that may be needed.