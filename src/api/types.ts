export type User = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member";
  team: {
    id: number;
    name: string;
    logoUrl: string | null;
    workCalendarUrl: string | null;
  };
};

export type SearchResult = {
  type: "task" | "meeting" | "decision" | "person";
  publicId: string;
  title: string;
  subtitle: string;
};
