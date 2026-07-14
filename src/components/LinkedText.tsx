const urlPattern = /https?:\/\/[^\s<>"']+/gi;
const inlineTokenPattern = /https?:\/\/[^\s<>"']+|\b[TPMDS]\d{3,}\b/g;

export type RecordReferenceType = "task" | "meeting" | "person" | "decision" | "series";

export type RecordReferenceTarget = {
  publicId: string;
  type: RecordReferenceType;
};

const recordTypeByPrefix: Record<string, RecordReferenceType> = {
  D: "decision",
  M: "meeting",
  P: "person",
  S: "series",
  T: "task",
};

const closingPairs: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

function countCharacter(value: string, character: string) {
  return [...value].filter((item) => item === character).length;
}

function splitUrl(rawUrl: string) {
  let url = rawUrl;
  let trailing = "";

  while (/[.,;!?]$/.test(url)) {
    trailing = `${url.at(-1) ?? ""}${trailing}`;
    url = url.slice(0, -1);
  }

  while (url) {
    const lastCharacter = url.at(-1) ?? "";
    const openingCharacter = closingPairs[lastCharacter];
    if (
      !openingCharacter ||
      countCharacter(url, lastCharacter) <= countCharacter(url, openingCharacter)
    ) {
      break;
    }

    trailing = `${lastCharacter}${trailing}`;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

export function recordReferenceForPublicId(publicId: string): RecordReferenceTarget | null {
  const type = recordTypeByPrefix[publicId.at(0) ?? ""];
  return type ? { publicId, type } : null;
}

export function collapseLinks(text: string) {
  const parts: string[] = [];
  let cursor = 0;

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const { trailing } = splitUrl(rawUrl);

    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }

    parts.push("Link");

    if (trailing) {
      parts.push(trailing);
    }

    cursor = index + rawUrl.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts.join("") : text;
}

export function LinkedText({
  text,
  onRecordOpen,
}: {
  text: string;
  onRecordOpen?: (target: RecordReferenceTarget) => void;
}) {
  const parts = [];
  let cursor = 0;

  for (const match of text.matchAll(inlineTokenPattern)) {
    const rawToken = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }

    if (/^https?:\/\//i.test(rawToken)) {
      const { url, trailing } = splitUrl(rawToken);

      parts.push(
        <a className="inline-text-link" href={url} key={`${url}-${index}`} rel="noreferrer" target="_blank">
          Link
        </a>,
      );

      if (trailing) {
        parts.push(trailing);
      }
    } else {
      const target = recordReferenceForPublicId(rawToken);

      if (target && onRecordOpen) {
        parts.push(
          <button
            aria-label={`Open ${target.type} ${target.publicId}`}
            className="inline-text-link inline-record-link"
            key={`${target.publicId}-${index}`}
            onClick={(event) => {
              event.stopPropagation();
              onRecordOpen(target);
            }}
            type="button"
          >
            {target.publicId}
          </button>,
        );
      } else {
        parts.push(rawToken);
      }
    }

    cursor = index + rawToken.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}
