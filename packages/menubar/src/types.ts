// Linear GraphQL レスポンスの型定義（必要なフィールドだけ）

export type IssueState = {
  name: string;
  color: string;
  type: string;
};

export type Project = {
  id: string;
  name: string;
  color?: string | null;
};

export type Issue = {
  identifier: string;
  title: string;
  url: string;
  updatedAt: string;
  state: IssueState | null;
  project: Project | null;
  team?: { key: string } | null;
  assignee?: { displayName: string } | null;
};

export type Viewer = {
  id: string;
  name: string;
  assignedIssues: { nodes: Issue[] };
  teamMemberships: {
    nodes: Array<{
      team: {
        id: string;
        key: string;
        name: string;
        issues: { nodes: Issue[] };
      };
    }>;
  };
};

export type LinearResponse =
  | { data: { viewer: Viewer }; errors?: undefined }
  | { errors: Array<{ message: string }>; data?: undefined };

export type Tab = "mine" | "team" | "project";
