import { type FormEvent, useEffect, useState } from "react";
import type { TeamDto, TeamUserDto, UserRole } from "../../../shared/types";
import { api, ApiError } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { FormField } from "../../components/FormField";

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

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Request failed";
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
  const [newUser, setNewUser] = useState<NewUserFormState>(emptyNewUserForm);
  const [loading, setLoading] = useState(true);
  const [teamStatus, setTeamStatus] = useState("");
  const [teamError, setTeamError] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [userError, setUserError] = useState("");
  const [roleError, setRoleError] = useState("");
  const [removeStatus, setRemoveStatus] = useState("");
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAdminData() {
      setLoading(true);
      try {
        const [teamResult, usersResult] = await Promise.all([
          api.admin.team(),
          api.admin.users(),
        ]);
        if (!active) return;
        setTeamForm(toTeamForm(teamResult.team));
        setUsers(usersResult.users);
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
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          aria-label={`Role for ${user.name}`}
                          onChange={(event) => void updateRole(user, event.target.value as UserRole)}
                          value={user.role}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="admin-user-actions">
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
          {roleError ? <p className="form-error">{roleError}</p> : null}
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
      </section>
    </main>
  );
}
