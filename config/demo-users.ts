// Demo personas. All share DEMO_USER_PASSWORD; the role switcher signs in as one of them.
export type DemoRole = "engineer" | "planner" | "supervisor" | "admin";

export interface DemoUser {
  email: string;
  display_name: string;
  role: DemoRole;
  department_id: string | null;
}

export const DEMO_EMAIL_DOMAIN = "corridoriq.demo";

export const DEMO_USERS: DemoUser[] = [
  { email: "planner@corridoriq.demo", display_name: "Corridor planner", role: "planner", department_id: null },
  { email: "supervisor@corridoriq.demo", display_name: "Supervisor", role: "supervisor", department_id: null },
  { email: "admin@corridoriq.demo", display_name: "Administrator", role: "admin", department_id: null },
  { email: "water@corridoriq.demo", display_name: "Water Supply engineer", role: "engineer", department_id: "water" },
  { email: "sewerage@corridoriq.demo", display_name: "Sewerage engineer", role: "engineer", department_id: "sewer" },
  { email: "msedcl@corridoriq.demo", display_name: "MSEDCL engineer", role: "engineer", department_id: "msedcl" },
  { email: "jio@corridoriq.demo", display_name: "Jio Fiber engineer", role: "engineer", department_id: "jio" },
  { email: "airtel@corridoriq.demo", display_name: "Airtel Fiber engineer", role: "engineer", department_id: "airtel" },
  { email: "mngl@corridoriq.demo", display_name: "MNGL engineer", role: "engineer", department_id: "mngl" },
  { email: "metro@corridoriq.demo", display_name: "Pune Metro engineer", role: "engineer", department_id: "metro" },
];
