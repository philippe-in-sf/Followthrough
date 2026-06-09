export type User = {
  id: number;
  name: string;
  email: string;
};

export type SearchResult = {
  type: "task" | "meeting" | "decision" | "person";
  publicId: string;
  title: string;
  subtitle: string;
};
