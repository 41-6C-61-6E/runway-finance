'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Trash2,
  LogOut,
  AlertTriangle,
  Info,
  Share2,
  Crown,
  User,
  ShieldCheck,
} from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareMember {
  id: string;
  memberUserId: string;
  joinedAt: string;
}

interface PendingInvitation {
  id: string;
  inviteeEmail: string;
  pin: string | null;
  createdAt: string;
}

interface ShareGroup {
  primaryUserId: string;
  allUserIds: string[];
  members: ShareMember[];
  pendingInvitations: PendingInvitation[];
}



// ── What's Shared Panel ───────────────────────────────────────────────────────

function WhatIsSharedPanel() {
  return (
    <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-primary shrink-0" />
        <h3 className="text-sm font-semibold text-foreground">How Shared Accounts Work</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-primary font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Shared between all members
          </div>
          <ul className="space-y-1 text-muted-foreground pl-5 list-disc">
            <li>All accounts and balances</li>
            <li>All transactions and categories</li>
            <li>Budgets and financial goals</li>
            <li>FIRE scenarios and retirement projections</li>
            <li>Category rules, tags</li>
            <li>SimpleFIN connections (visible to all)</li>
          </ul>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
            <User className="w-3.5 h-3.5" />
            Separate per account
          </div>
          <ul className="space-y-1 text-muted-foreground pl-5 list-disc">
            <li>Theme, accent color, display preferences</li>
            <li>Chart visibility and color settings</li>
            <li>Privacy mode and compact mode</li>
            <li>AI settings and API keys</li>
            <li>Hidden pages configuration</li>
            <li>SimpleFIN connections can only be <em>edited</em> by their owner</li>
          </ul>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground/80 border-t border-border pt-2">
        All data is encrypted end-to-end. Each account uses its own key to encrypt the same shared database — there is no duplicate data.
        If sharing is removed, the account owner retains all data; the removed member starts fresh with an empty account.
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SharingTab() {
  const [group, setGroup] = useState<ShareGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');


  // Copy helper for pending list
  const [origin, setOrigin] = useState('');
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextId(id);
    setTimeout(() => setCopiedTextId(null), 1500);
  };

  // Confirm dialogs
  const [confirmRevoke, setConfirmRevoke] = useState<PendingInvitation | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ShareMember | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch('/api/sharing', { credentials: 'include' });
      const data = await res.json();
      setGroup(data.group ?? null);
    } catch {
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      const data = await res.json();
      // user-settings returns userId indirectly; get it from session
      const sessRes = await fetch('/api/auth/session', { credentials: 'include' });
      const sess = await sessRes.json();
      setCurrentUser(sess?.user?.id ?? null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    fetchGroup();
    fetchCurrentUser();
  }, [fetchGroup, fetchCurrentUser]);

  const isPrimary = currentUser && group ? group.primaryUserId === currentUser : true;

  // ── Invite ──────────────────────────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');

    try {
      const res = await fetch('/api/sharing/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ inviteeEmail: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.message || 'Failed to create invitation');
      } else {
        setInviteEmail('');
        await fetchGroup();
      }
    } catch {
      setInviteError('An unexpected error occurred');
    } finally {
      setInviteLoading(false);
    }
  };

  // ── Revoke invitation ───────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!confirmRevoke) return;
    setActionLoading(true);
    try {
      await fetch(`/api/sharing/invite/${confirmRevoke.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await fetchGroup();
    } finally {
      setActionLoading(false);
      setConfirmRevoke(null);
    }
  };

  // ── Remove member ───────────────────────────────────────────────────────────

  const handleRemove = async () => {
    if (!confirmRemove) return;
    setActionLoading(true);
    try {
      await fetch(`/api/sharing/members/${confirmRemove.memberUserId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await fetchGroup();
    } finally {
      setActionLoading(false);
      setConfirmRemove(null);
    }
  };

  // ── Leave (self-remove as member) ───────────────────────────────────────────

  const handleLeave = async () => {
    if (!currentUser) return;
    setActionLoading(true);
    try {
      await fetch(`/api/sharing/members/${currentUser}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      await fetchGroup();
    } finally {
      setActionLoading(false);
      setConfirmLeave(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── No share group yet — primary view ────────────────────────────────────────

  if (!group) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Account Sharing</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Invite up to 3 other users to share your financial data. You&apos;ll remain the owner.
          </p>
        </div>

        <WhatIsSharedPanel />

        {/* Invite form */}
        <div className="p-4 bg-card border border-border rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Invite Someone</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the email address of the person you want to invite. A unique 8-digit PIN will be generated.
            Share the PIN with them out-of-band (e.g., text message). They will use it when creating their account.
          </p>

          {inviteError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">{inviteError}</p>
            </div>
          )}



          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invitee email address"
              required
              className="flex-1 px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
            />
            <button
              type="submit"
              disabled={inviteLoading || !inviteEmail}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {inviteLoading ? (
                <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Invite
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Active share group view ──────────────────────────────────────────────────

  const memberCount = 1 + group.members.length; // primary + members
  const canInviteMore = memberCount + group.pendingInvitations.length < 4;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Account Sharing</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {isPrimary
            ? `You are the account owner. ${memberCount} of 4 slots used.`
            : `You are sharing ${group.primaryUserId}'s account.`}
        </p>
      </div>

      <WhatIsSharedPanel />

      {/* Members */}
      <div className="p-4 bg-card border border-border rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Members ({memberCount})</h3>
        </div>

        <div className="space-y-2">
          {/* Primary */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground truncate">{group.primaryUserId}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/15 text-primary rounded font-medium">Owner</span>
                {currentUser === group.primaryUserId && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">You</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Data owner — all members share this account</p>
            </div>
          </div>

          {/* Members */}
          {group.members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-muted/30 border border-border rounded-lg">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{m.memberUserId}</span>
                  {currentUser === m.memberUserId && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">You</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Joined {formatDate(m.joinedAt)}</p>
              </div>
              {/* Remove (primary can remove; member can leave) */}
              {(isPrimary || currentUser === m.memberUserId) && (
                <button
                  onClick={() => {
                    if (currentUser === m.memberUserId) {
                      setConfirmLeave(true);
                    } else {
                      setConfirmRemove(m);
                    }
                  }}
                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
                  title={currentUser === m.memberUserId ? 'Leave shared account' : 'Remove member'}
                >
                  {currentUser === m.memberUserId ? <LogOut className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          ))}

          {/* Member self-leave button (if currently signed in as a member) */}
          {!isPrimary && currentUser && (
            <button
              onClick={() => setConfirmLeave(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Leave Shared Account
            </button>
          )}
        </div>
      </div>

      {/* Pending invitations */}
      {isPrimary && (
        <div className="p-4 bg-card border border-border rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Pending Invitations</h3>
            </div>
          </div>

          {group.pendingInvitations.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending invitations.</p>
          ) : (
            <div className="space-y-2">
              {group.pendingInvitations.map((inv) => (
                <div key={inv.id} className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <UserPlus className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{inv.inviteeEmail}</p>
                      <button
                        onClick={() => setConfirmRevoke(inv)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded hover:bg-muted/50"
                        title="Revoke invitation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Created {formatDate(inv.createdAt)} · Awaiting sign-up</p>
                    
                    {/* Share Link and Code details */}
                    <div className="mt-2 space-y-1 bg-background/50 border border-border/40 p-2 rounded-lg text-xs">
                      {inv.pin && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            Code: <strong className="font-mono text-foreground">{inv.pin}</strong>
                          </span>
                          <button
                            onClick={() => handleCopyText(inv.pin || '', `pin-${inv.id}`)}
                            className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1"
                          >
                            {copiedTextId === `pin-${inv.id}` ? 'Copied!' : 'Copy Code'}
                          </button>
                        </div>
                      )}
                      {(() => {
                        const directUrl = `${origin}/signin?mode=join&email=${encodeURIComponent(inv.inviteeEmail)}` + (inv.pin ? `&pin=${encodeURIComponent(inv.pin)}` : '');
                        return (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground truncate max-w-[200px] sm:max-w-xs" title={directUrl}>
                              Link: <span className="font-mono text-foreground select-all">{origin}/signin?mode=join...</span>
                            </span>
                            <button
                              onClick={() => handleCopyText(directUrl, `link-${inv.id}`)}
                              className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 shrink-0"
                            >
                              {copiedTextId === `link-${inv.id}` ? 'Copied!' : 'Copy Direct Link'}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invite more */}
          {canInviteMore && (
            <>
              {inviteError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{inviteError}</p>
                </div>
              )}



              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Invitee email address"
                  required
                  className="flex-1 px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={inviteLoading || !inviteEmail}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {inviteLoading ? (
                    <span className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  Invite
                </button>
              </form>
            </>
          )}

          {!canInviteMore && (
            <p className="text-xs text-muted-foreground">Maximum group size (4 users) reached.</p>
          )}
        </div>
      )}

      {/* Confirm: revoke invitation */}
      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => { if (!o) setConfirmRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The invitation for <strong>{confirmRevoke?.inviteeEmail}</strong> will be permanently revoked.
              They will not be able to use the PIN to join your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <button
              onClick={handleRevoke}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-semibold text-destructive-foreground bg-destructive hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
            >
              {actionLoading ? 'Revoking...' : 'Revoke'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: remove member */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmRemove?.memberUserId}</strong> will be removed from your shared account.
              They will no longer be able to access your financial data.
              Their personal settings (theme, etc.) will be preserved, but they will start with an empty account if they continue using the app.
              <br /><br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <button
              onClick={handleRemove}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-semibold text-destructive-foreground bg-destructive hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
            >
              {actionLoading ? 'Removing...' : 'Remove Member'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: leave (self) */}
      <AlertDialog open={confirmLeave} onOpenChange={(o) => { if (!o) setConfirmLeave(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Shared Account?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be removed from <strong>{group.primaryUserId}</strong>&apos;s shared account.
              You will no longer see their financial data.
              Your personal settings (theme, etc.) will be preserved, but you will start with an empty account.
              <br /><br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <button
              onClick={handleLeave}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-semibold text-destructive-foreground bg-destructive hover:opacity-90 rounded-lg transition-all disabled:opacity-50"
            >
              {actionLoading ? 'Leaving...' : 'Leave Account'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
