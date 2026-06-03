-- ── Account Sharing Invitations ──────────────────────────────────────────────
-- Stores pending invitations before User B accepts.
-- Invitations do not expire; they must be explicitly revoked.
CREATE TABLE IF NOT EXISTS account_sharing_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id TEXT NOT NULL,
  invitee_email   TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  pin             TEXT,                            -- plaintext code for display
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'revoked'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Account Share Members ─────────────────────────────────────────────────────
-- Records the active sharing relationship after an invitation is accepted.
CREATE TABLE IF NOT EXISTS account_share_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_user_id TEXT NOT NULL,   -- User A (original data owner)
  member_user_id  TEXT NOT NULL,   -- User B (joined member)
  invitation_id   UUID REFERENCES account_sharing_invitations(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'removed'
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at      TIMESTAMPTZ,
  removed_by      TEXT,
  UNIQUE (primary_user_id, member_user_id)
);

-- ── Extend user_encryption_keys ──────────────────────────────────────────────
-- Track which users are secondary (their DEK wraps another user's raw key).
ALTER TABLE user_encryption_keys
  ADD COLUMN IF NOT EXISTS primary_user_id TEXT; -- NULL for standalone/primary users
