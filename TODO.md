## TO DO LIST
# AGENTS: How to use this list - Fix one bug at a time; investigate, fix, build, deploy, check logs -- if all looks well, then make the issue as pending resovle in the list and move to the next item.


BUGS:
- l



CHANGES:
- more app logs


NEW FEATUES:
- The database stores net worth and account value snapshots. however, it only has account values from the time the account was added to the present. Would it be poaaible to use the account transaction data to create account snapshot values for past dates? Could the sync scheduler also check if snapshot values, if not available for a particular day, could be generated using transaction data for that account? Of course, account value from the simpleFIN bridge always needs to be the source of truth. generated values could be tagged in teh database as synthetic or calculated or something just in case they are incorrect. Help me think through the logic of this idea. THis would allow charts, graphs, and reports to show historical data as far back as the sync is able to get transaction data.