/*
  Runs the token check once, now, instead of waiting for noon.

  The job just learned to ask Meta whether the token still works rather than
  comparing its stored expiry against the calendar, and the account it will
  ask about was reconnected an hour ago. Better to find out immediately than
  to discover at midday that the new check itself is broken.

  Invoked exactly the way the scheduler invokes it, so the secret comes from
  the vault and nothing new gets a way in.
*/

SELECT invoke_edge_function('check-tokens');
