import React from "react";
import { User } from "lucide-react";

interface CommentCardProps {
  author: string;
  avatarUrl: string | null;
  association?: string | null;
  createdAt: string;
  body: string;
  verdict?: string | null;
  prAuthor?: string;
}

// A simple relative time formatter
export const getRelativeDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
};

// A simple custom regex-based markdown formatter to avoid external libraries
export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  // Split content by paragraphs
  const paragraphs = content.split(/\n\n+/);

  const formatText = (text: string) => {
    // 1. Safe escape HTML characters (basic)
    let formatted = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 2. Bold: **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // 3. Inline code: `code`
    formatted = formatted.replace(/`(.*?)`/g, "<code class='bg-zinc-800 text-zinc-300 font-mono text-[11px] px-1 rounded'>$1</code>");

    // 4. Links: [text](url)
    formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, "<a href='$2' target='_blank' class='text-indigo-400 hover:underline'>$1</a>");

    // 5. Raw URL links
    formatted = formatted.replace(/(?<!["'])(https?:\/\/[^\s<]+)/g, "<a href='$1' target='_blank' class='text-indigo-400 hover:underline'>$1</a>");

    return formatted;
  };

  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-300">
      {paragraphs.map((p, i) => {
        // If it starts with a codeblock ```
        if (p.trim().startsWith("```")) {
          const lines = p.trim().split("\n");
          const code = lines.slice(1, lines.length - 1).join("\n");
          return (
            <pre key={i} className="bg-zinc-950 border border-zinc-800 p-3 rounded font-mono text-[11px] text-zinc-400 overflow-x-auto whitespace-pre">
              <code>{code}</code>
            </pre>
          );
        }

        // If it starts with list item `-` or `*` or `1.`
        if (p.trim().startsWith("- ") || p.trim().startsWith("* ")) {
          const items = p.trim().split("\n");
          return (
            <ul key={i} className="list-disc list-inside pl-2 space-y-1">
              {items.map((item, idx) => (
                <li
                  key={idx}
                  dangerouslySetInnerHTML={{ __html: formatText(item.trim().substring(2)) }}
                />
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: formatText(p.replace(/\n/g, "<br />")) }}
          />
        );
      })}
    </div>
  );
};

export const CommentCard: React.FC<CommentCardProps> = ({
  author,
  avatarUrl,
  association,
  createdAt,
  body,
  verdict,
  prAuthor,
}) => {
  const getVerdictLabel = () => {
    switch (verdict) {
      case "approved":
        return { label: "approved these changes", className: "text-emerald-400" };
      case "changes_requested":
        return { label: "requested changes", className: "text-rose-400" };
      case "dismissed":
        return { label: "review dismissed", className: "text-zinc-500" };
      case "commented":
        return { label: "reviewed", className: "text-zinc-500" };
      default:
        return null;
    }
  };

  const getChips = () => {
    const out: string[] = [];
    if (association === "OWNER") out.push("Owner");
    else if (association === "MEMBER") out.push("Member");
    else if (association === "COLLABORATOR") out.push("Collaborator");
    if (prAuthor && author === prAuthor) out.push("Author");
    return out;
  };

  const verdictBadge = getVerdictLabel();
  const chips = getChips();

  return (
    <div className="flex gap-3">
      {avatarUrl ? (
        <img src={avatarUrl} alt={author} className="w-5 h-5 rounded-full mt-1 shrink-0 bg-zinc-800" />
      ) : (
        <div className="w-5 h-5 rounded-full mt-1 shrink-0 bg-zinc-800 flex items-center justify-center text-zinc-500">
          <User size={10} />
        </div>
      )}

      <div className="min-w-0 flex-1 rounded border border-zinc-800 overflow-hidden bg-zinc-950/30">
        {/* Header Bar */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-850 text-[10px] font-mono">
          <span className="font-semibold text-zinc-200">{author}</span>
          {verdictBadge ? (
            <span className={verdictBadge.className}>{verdictBadge.label}</span>
          ) : (
            <span className="text-zinc-500">commented</span>
          )}
          <span className="text-zinc-600">{getRelativeDate(createdAt)}</span>
          <span className="flex-1" />
          <div className="flex gap-1">
            {chips.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500 text-[9px] font-medium scale-90"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Content Body */}
        {body && (
          <div className="px-3 py-2.5">
            <MarkdownRenderer content={body} />
          </div>
        )}
      </div>
    </div>
  );
};
