---
description: To be followed by all agents
# applyTo: 'Describe when these instructions should be loaded by the agent based on task context' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

When executing large-scope reviews, coding tasks, or research, and when it makes sense to do so, spawn focused subagents or parallel audit passes for specific sub-domains to ensure exhaustive coverage without cognitive degradation. Keep subagent scope tight and focused on a single concern or task, provide clear instructions for each subagent, and review their outputs for consistency and completeness.

If a Subagent fails, consider re-spawning it with adjusted instructions or a narrower scope. 

If working a large task, periodically output an estimated percentage complete withe the task, and summary of the current state of the task, including what has been completed, what remains to be done, and any issues or blockers encountered. 

The dev server is running at http://10.1.1.10:3001 You can use this to test your changes locally before committing them.

All thinking, reasoning, planning, compaction, and coding shall be exclusively conducted in the english language. 