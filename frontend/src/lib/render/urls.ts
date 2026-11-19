// ADO work item and PR URL helpers (06 section 6, 05 D4). One whole template per kind with
// an {id} placeholder. A template that is unset, has no {id}, or is not http(s) gives null,
// and the caller shows plain text: a link is never guessed.

export interface UrlHelpers {
  ado(id: number): string | null
  pr(id: number): string | null
}

export interface UrlTemplates {
  adoWorkItemUrl?: string | null
  adoPrUrl?: string | null
}

function fill(template: string | null | undefined, id: number): string | null {
  if (!template || !template.includes('{id}') || !/^https?:\/\//i.test(template)) return null
  return template.replace('{id}', String(id))
}

export function makeUrls(cfg: UrlTemplates | null | undefined): UrlHelpers {
  return {
    ado: (id) => fill(cfg?.adoWorkItemUrl, id),
    pr: (id) => fill(cfg?.adoPrUrl, id),
  }
}
