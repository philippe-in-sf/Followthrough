const urlPattern = /https?:\/\/[^\s<>"']+/gi;

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

export function LinkedText({ text }: { text: string }) {
  const parts = [];
  let cursor = 0;

  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const { url, trailing } = splitUrl(rawUrl);

    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }

    parts.push(
      <a className="inline-text-link" href={url} key={`${url}-${index}`} rel="noreferrer" target="_blank">
        Link
      </a>,
    );

    if (trailing) {
      parts.push(trailing);
    }

    cursor = index + rawUrl.length;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}
