// Only game players need cross-origin isolation. Applying it to the library
// blocks third-party cover art and decorative images that lack CORP headers.
export function needsGameIsolation(file,html){
 return file.startsWith('games/')&&html.includes('/ports/')&&!html.includes('<meta name="cross-origin-isolation" content="unneeded">');
}
