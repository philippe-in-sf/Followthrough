import { type FormEvent, useEffect, useState } from "react";
import type {
  TeamDto,
  TeamUserDto,
  UserLoginEventDto,
  UserRole,
  WaitlistSignupDto,
} from "../../../shared/types";
import { api, ApiError } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";
import { PaginatedItems } from "../../components/PaginatedItems";
import { StatusBadge } from "../../components/StatusBadge";

type TeamFormState = {
  name: string;
  logoUrl: string;
  workCalendarUrl: string;
};

type NewUserFormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

type PasswordResetFormState = {
  password: string;
};

type WaitlistInviteFormState = {
  code: string;
  role: UserRole;
};

type WaitlistDirectUserFormState = {
  password: string;
  role: UserRole;
};

const emptyNewUserForm: NewUserFormState = {
  name: "",
  email: "",
  password: "",
  role: "member",
};

function toTeamForm(team: TeamDto): TeamFormState {
  return {
    name: team.name,
    logoUrl: team.logoUrl ?? "",
    workCalendarUrl: team.workCalendarUrl ?? "",
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function defaultInviteCode(signup: WaitlistSignupDto) {
  const emailName = signup.email.split("@")[0] ?? "";
  return `${slugify(emailName || signup.name) || "waitlist"}-${signup.id}`;
}

function initialInviteForms(signups: WaitlistSignupDto[]) {
  return Object.fromEntries(
    signups.map((signup) => [
      signup.id,
      {
        code: defaultInviteCode(signup),
        role: "member" as UserRole,
      },
    ]),
  ) as Record<number, WaitlistInviteFormState>;
}

function initialDirectUserForms(signups: WaitlistSignupDto[]) {
  return Object.fromEntries(
    signups.map((signup) => [
      signup.id,
      {
        password: "",
        role: "member" as UserRole,
      },
    ]),
  ) as Record<number, WaitlistDirectUserFormState>;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Request failed";
}

function formatLoginTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AdminPage({
  currentUserId,
  onTeamChange,
}: {
  currentUserId: number;
  onTeamChange: (team: TeamDto) => void;
}) {
  const [teamForm, setTeamForm] = useState<TeamFormState>({
    name: "",
    logoUrl: "",
    workCalendarUrl: "",
  });
  const [users, setUsers] = useState<TeamUserDto[]>([]);
  const [loginEvents, setLoginEvents] = useState<UserLoginEventDto[]>([]);
  const [waitlistSignups, setWaitlistSignups] = useState<WaitlistSignupDto[]>([]);
  const [inviteForms, setInviteForms] = useState<Record<number, WaitlistInviteFormState>>({});
  const [directUserForms, setDirectUserForms] = useState<
    Record<number, WaitlistDirectUserFormState>
  >({});
  const [newUser, setNewUser] = useState<NewUserFormState>(emptyNewUserForm);
  const [passwordResetForms, setPasswordResetForms] = useState<Record<number, PasswordResetFormState>>({});
  const [loading, setLoading] = useState(true);
  const [teamStatus, setTeamStatus] = useState("");
  const [teamError, setTeamError] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [userError, setUserError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [removeStatus, setRemoveStatus] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [passwordResetStatus, setPasswordResetStatus] = useState("");
  const [passwordResetError, setPasswordResetError] = useState("");
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<number | null>(null);
  const [loginDetailsVisible, setLoginDetailsVisible] = useState(false);
  const [waitlistStatus, setWaitlistStatus] = useState("");
  const [waitlistError, setWaitlistError] = useState("");
  const [handlingSignupId, setHandlingSignupId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAdminData() {
      setLoading(true);
      try {
        const [teamResult, usersResult, loginEventsResult, waitlistResult] = await Promise.all([
          api.admin.team(),
          api.admin.users(),
          api.admin.loginEvents(),
          api.admin.waitlist(),
        ]);
        if (!active) return;
        setTeamForm(toTeamForm(teamResult.team));
        setUsers(usersResult.users);
        setLoginEvents(loginEventsResult.loginEvents);
        setWaitlistSignups(waitlistResult.signups);
        setInviteForms(initialInviteForms(waitlistResult.signups));
        setDirectUserForms(initialDirectUserForms(waitlistResult.signups));
      } catch (error) {
        if (active) setUserError(errorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAdminData();
    return () => {
      active = false;
    };
  }, []);

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTeamStatus("");
    setTeamError("");
    try {
      const result = await api.admin.updateTeam({
        name: teamForm.name,
        logoUrl: teamForm.logoUrl || null,
        workCalendarUrl: teamForm.workCalendarUrl || null,
      });
      setTeamForm(toTeamForm(result.team));
      onTeamChange(result.team);
      setTeamStatus("Team settings saved");
    } catch (error) {
      setTeamError(errorMessage(error));
    }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserStatus("");
    setUserError("");
    try {
      const result = await api.admin.createUser(newUser);
      setUsers((current) => [...current, result.user].sort((a, b) => a.name.localeCompare(b.name)));
      setNewUser(emptyNewUserForm);
      setUserStatus("User added");
    } catch (error) {
      setUserError(errorMessage(error));
    }
  }

  function updateWaitlistSignup(signup: WaitlistSignupDto) {
    setWaitlistSignups((current) =>
      current.map((candidate) => (candidate.id === signup.id ? signup : candidate)),
    );
  }

  async function createInviteForSignup(
    event: FormEvent<HTMLFormElement>,
    signup: WaitlistSignupDto,
  ) {
    event.preventDefault();
    const form = inviteForms[signup.id] ?? { code: defaultInviteCode(signup), role: "member" };
    setWaitlistStatus("");
    setWaitlistError("");
    setHandlingSignupId(signup.id);

    try {
      const result = await api.admin.createWaitlistInviteCode(signup.id, form);
      updateWaitlistSignup(result.signup);
      setWaitlistStatus(`Invite ${result.inviteCode.code} created for ${signup.name}`);
    } catch (error) {
      setWaitlistError(errorMessage(error));
    } finally {
      setHandlingSignupId(null);
    }
  }

  async function createDirectUserForSignup(
    event: FormEvent<HTMLFormElement>,
    signup: WaitlistSignupDto,
  ) {
    event.preventDefault();
    const form = directUserForms[signup.id] ?? { password: "", role: "member" };
    setWaitlistStatus("");
    setWaitlistError("");
    setHandlingSignupId(signup.id);

    try {
      const result = await api.admin.createWaitlistUser(signup.id, form);
      updateWaitlistSignup(result.signup);
      setUsers((current) => {
        const existing = current.some((user) => user.id === result.user.id);
        const next = existing
          ? current.map((user) => (user.id === result.user.id ? result.user : user))
          : [...current, result.user];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      setDirectUserForms((current) => ({
        ...current,
        [signup.id]: { ...(current[signup.id] ?? { role: "member" as UserRole }), password: "" },
      }));
      setWaitlistStatus(`User ${result.user.email} created`);
    } catch (error) {
      setWaitlistError(errorMessage(error));
    } finally {
      setHandlingSignupId(null);
    }
  }

  function waitlistHandledText(signup: WaitlistSignupDto) {
    const handler = signup.handledByName ?? "admin";
    if (signup.handledAction === "invite_code" && signup.inviteCode) {
      return `Handled with invite ${signup.inviteCode} by ${handler}`;
    }
    if (signup.handledAction === "direct_user") {
      return `Direct user created by ${handler}`;
    }
    return "";
  }

  async function updateRole(user: TeamUserDto, role: UserRole) {
    setRoleError("");
    try {
      const result = await api.admin.updateUserRole(user.id, role);
      setUsers((current) =>
        current.map((candidate) => (candidate.id === result.user.id ? result.user : candidate)),
      );
    } catch (error) {
      setRoleError(errorMessage(error));
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>, user: TeamUserDto) {
    event.preventDefault();
    const form = passwordResetForms[user.id] ?? { password: "" };
    setPasswordResetStatus("");
    setPasswordResetError("");
    setResettingPasswordUserId(user.id);

    try {
      await api.admin.resetUserPassword(user.id, form.password);
      setPasswordResetForms((current) => ({ ...current, [user.id]: { password: "" } }));
      setPasswordResetStatus(`Password reset for ${user.name}`);
    } catch (error) {
      setPasswordResetError(errorMessage(error));
    } finally {
      setResettingPasswordUserId(null);
    }
  }

  async function removeUserFromTeam(user: TeamUserDto) {
    const confirmed = window.confirm(
      `Remove ${user.name} from this team? They will lose access to this team's tasks, meetings, decisions, and people records.`,
    );
    if (!confirmed) return;

    setRemoveStatus("");
    setRemoveError("");
    try {
      await api.admin.removeUserFromTeam(user.id);
      setUsers((current) => current.filter((candidate) => candidate.id !== user.id));
      setRemoveStatus(`${user.name} removed from team`);
    } catch (error) {
      setRemoveError(errorMessage(error));
    }
  }

  if (loading) return <main className="page admin-page">Loading admin settings...</main>;

  return (
    <main className="page admin-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Team settings</h1>
        </div>
      </section>

      <section className="admin-layout">
        <form className="admin-panel" onSubmit={saveTeam}>
          <div className="panel-heading">
            <h2>Team</h2>
          </div>
          <FormField label="Team name">
            <input
              name="teamName"
              onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
              required
              value={teamForm.name}
            />
          </FormField>
          <FormField label="Logo URL">
            <input
              name="logoUrl"
              onChange={(event) =>
                setTeamForm((current) => ({ ...current, logoUrl: event.target.value }))
              }
              type="url"
              value={teamForm.logoUrl}
            />
          </FormField>
          <FormField label="Shared calendar URL">
            <input
              name="workCalendarUrl"
              onChange={(event) =>
                setTeamForm((current) => ({ ...current, workCalendarUrl: event.target.value }))
              }
              type="url"
              value={teamForm.workCalendarUrl}
            />
          </FormField>
          {teamError ? <p className="form-error">{teamError}</p> : null}
          {teamStatus ? <p className="form-status">{teamStatus}</p> : null}
          <button className="primary-button" type="submit">
            Save team settings
          </button>
        </form>

        <section className="admin-panel">
          <div className="panel-heading">
            <h2>Users</h2>
          </div>
          {users.length === 0 ? (
            <EmptyState title="No users" detail="Add a team user to get started." />
          ) : (
            <PaginatedItems
              items={users}
              itemName="user"
              pageSize={6}
              getItemKey={(user) => String(user.id)}
            >
              {(visibleUsers) => (
                <div className="admin-user-table-wrap">
                  <table className="admin-user-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUsers.map((user) => (
                        <tr key={user.id}>
                          <td data-label="Name">{user.name}</td>
                          <td data-label="Email">{user.email}</td>
                          <td data-label="Role">
                            <select
                              aria-label={`Role for ${user.name}`}
                              disabled={user.role === "owner"}
                              onChange={(event) => void updateRole(user, event.target.value as UserRole)}
                              value={user.role}
                            >
                              {user.role === "owner" ? <option value="owner">Owner</option> : null}
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="admin-user-actions" data-label="Actions">
                            <form
                              className="admin-password-reset-form"
                              onSubmit={(event) => void resetPassword(event, user)}
                            >
                              <FormField label={`New password for ${user.name}`}>
                                <input
                                  autoComplete="new-password"
                                  minLength={12}
                                  name={`resetPassword-${user.id}`}
                                  onChange={(event) =>
                                    setPasswordResetForms((current) => ({
                                      ...current,
                                      [user.id]: { password: event.target.value },
                                    }))
                                  }
                                  required
                                  type="password"
                                  value={passwordResetForms[user.id]?.password ?? ""}
                                />
                              </FormField>
                              <button
                                className="secondary-button"
                                disabled={resettingPasswordUserId === user.id}
                                type="submit"
                              >
                                {resettingPasswordUserId === user.id ? "Resetting..." : "Reset password"}
                              </button>
                            </form>
                            {user.id === currentUserId ? null : (
                              <button
                                className="danger-button"
                                onClick={() => void removeUserFromTeam(user)}
                                type="button"
                              >
                                Remove from team
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PaginatedItems>
          )}
          {roleError ? <p className="form-error">{roleError}</p> : null}
          {passwordResetError ? <p className="form-error">{passwordResetError}</p> : null}
          {passwordResetStatus ? <p className="form-status">{passwordResetStatus}</p> : null}
          {removeError ? <p className="form-error">{removeError}</p> : null}
          {removeStatus ? <p className="form-status">{removeStatus}</p> : null}

          <form className="admin-add-user-form" onSubmit={addUser}>
            <h3>Add user</h3>
            <FormField label="New user name">
              <input
                name="newUserName"
                onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))}
                required
                value={newUser.name}
              />
            </FormField>
            <FormField label="New user email">
              <input
                name="newUserEmail"
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, email: event.target.value }))
                }
                required
                type="email"
                value={newUser.email}
              />
            </FormField>
            <FormField label="Temporary password">
              <input
                name="temporaryPassword"
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, password: event.target.value }))
                }
                required
                type="password"
                value={newUser.password}
              />
            </FormField>
            <FormField label="New user role">
              <select
                name="newUserRole"
                onChange={(event) =>
                  setNewUser((current) => ({ ...current, role: event.target.value as UserRole }))
                }
                value={newUser.role}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </FormField>
            {userError ? <p className="form-error">{userError}</p> : null}
            {userStatus ? <p className="form-status">{userStatus}</p> : null}
            <button className="primary-button" type="submit">
              Add user
            </button>
          </form>
        </section>

        <section className="admin-panel admin-login-log-panel">
          <div className="panel-heading">
            <div>
              <h2>Login log</h2>
              <p className="admin-panel-note">
                Successful sign-ins by date and time. Network details stay hidden until confirmed.
              </p>
            </div>
            {loginEvents.length > 0 && !loginDetailsVisible ? (
              <button
                className="secondary-button"
                onClick={() => setLoginDetailsVisible(true)}
                type="button"
              >
                Show IP and browser
              </button>
            ) : null}
          </div>
          {loginEvents.length === 0 ? (
            <EmptyState title="No logins yet" detail="Successful team sign-ins appear here." />
          ) : (
            <PaginatedItems
              items={loginEvents}
              itemName="login"
              pageSize={8}
              getItemKey={(event) => String(event.id)}
            >
              {(visibleLoginEvents) => (
                <div className="admin-user-table-wrap">
                  <table className="admin-user-table admin-login-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Date and time</th>
                        <th>IP</th>
                        <th>Browser</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLoginEvents.map((event) => (
                        <tr key={event.id}>
                          <td data-label="User">
                            <strong>{event.userName}</strong>
                            <span>{event.userEmail}</span>
                          </td>
                          <td data-label="Date and time">{formatLoginTime(event.createdAt)}</td>
                          <td data-label="IP">
                            {loginDetailsVisible ? event.ipAddress ?? "Unknown" : "Hidden"}
                          </td>
                          <td data-label="Browser">
                            {loginDetailsVisible ? event.userAgent ?? "Unknown" : "Hidden"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PaginatedItems>
          )}
        </section>

        <section className="admin-panel admin-waitlist-panel">
          <div className="panel-heading">
            <h2>Waitlist</h2>
          </div>
          {waitlistSignups.length === 0 ? (
            <EmptyState title="No waitlist signups" detail="New public waitlist requests appear here." />
          ) : (
            <PaginatedItems
              items={waitlistSignups}
              itemName="signup"
              pageSize={6}
              getItemKey={(signup) => String(signup.id)}
            >
              {(visibleSignups) => (
                <ul className="waitlist-signup-list">
                  {visibleSignups.map((signup) => {
                    const inviteForm = inviteForms[signup.id] ?? {
                      code: defaultInviteCode(signup),
                      role: "member" as UserRole,
                    };
                    const directUserForm = directUserForms[signup.id] ?? {
                      password: "",
                      role: "member" as UserRole,
                    };
                    const handledText = waitlistHandledText(signup);
                    const handled = Boolean(signup.handledAt);
                    const busy = handlingSignupId === signup.id;

                    return (
                      <li
                        aria-label={`${signup.name} ${signup.email}`}
                        className="waitlist-signup"
                        key={signup.id}
                      >
                        <div className="waitlist-signup-summary">
                          <div>
                            <strong>{signup.name}</strong>
                            <span>{signup.email}</span>
                          </div>
                          <StatusBadge
                            label={handled ? "Handled" : "Pending"}
                            tone={handled ? "good" : "warn"}
                          />
                        </div>

                        {handled ? (
                          <p className="form-status waitlist-handled-status">{handledText}</p>
                        ) : (
                          <div className="waitlist-actions">
                            <form
                              className="waitlist-action-form"
                              onSubmit={(event) => void createInviteForSignup(event, signup)}
                            >
                              <h3>Invite code</h3>
                              <FormField label={`Invite code for ${signup.name}`}>
                                <input
                                  name={`inviteCode-${signup.id}`}
                                  onChange={(event) =>
                                    setInviteForms((current) => ({
                                      ...current,
                                      [signup.id]: {
                                        ...inviteForm,
                                        code: event.target.value,
                                      },
                                    }))
                                  }
                                  required
                                  value={inviteForm.code}
                                />
                              </FormField>
                              <FormField label={`Invite role for ${signup.name}`}>
                                <select
                                  name={`inviteRole-${signup.id}`}
                                  onChange={(event) =>
                                    setInviteForms((current) => ({
                                      ...current,
                                      [signup.id]: {
                                        ...inviteForm,
                                        role: event.target.value as UserRole,
                                      },
                                    }))
                                  }
                                  value={inviteForm.role}
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </FormField>
                              <button className="secondary-button" disabled={busy} type="submit">
                                Create invite for {signup.name}
                              </button>
                            </form>

                            <form
                              className="waitlist-action-form"
                              onSubmit={(event) => void createDirectUserForSignup(event, signup)}
                            >
                              <h3>Direct user</h3>
                              <FormField label={`Temporary password for ${signup.name}`}>
                                <input
                                  name={`directUserPassword-${signup.id}`}
                                  onChange={(event) =>
                                    setDirectUserForms((current) => ({
                                      ...current,
                                      [signup.id]: {
                                        ...directUserForm,
                                        password: event.target.value,
                                      },
                                    }))
                                  }
                                  required
                                  type="password"
                                  value={directUserForm.password}
                                />
                              </FormField>
                              <FormField label={`Direct user role for ${signup.name}`}>
                                <select
                                  name={`directUserRole-${signup.id}`}
                                  onChange={(event) =>
                                    setDirectUserForms((current) => ({
                                      ...current,
                                      [signup.id]: {
                                        ...directUserForm,
                                        role: event.target.value as UserRole,
                                      },
                                    }))
                                  }
                                  value={directUserForm.role}
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </FormField>
                              <button className="primary-button" disabled={busy} type="submit">
                                Create user for {signup.name}
                              </button>
                            </form>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </PaginatedItems>
          )}
          {waitlistError ? <p className="form-error">{waitlistError}</p> : null}
          {waitlistStatus ? <p className="form-status">{waitlistStatus}</p> : null}
        </section>
      </section>
    </main>
  );
}
