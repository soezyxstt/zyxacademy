// Each target opens its platform's compose or share UI with the public article URL.
export function blogShareDestinations(title: string, articleUrl: string) {
  const url = encodeURIComponent(articleUrl);
  return {
    WhatsApp: "https://api.whatsapp.com/send?text=" + encodeURIComponent(title + " " + articleUrl),
    Line: "https://social-plugins.line.me/lineit/share?url=" + url,
    "X (Twitter)": "https://twitter.com/intent/tweet?url=" + url + "&text=" + encodeURIComponent(title),
    Facebook: "https://www.facebook.com/sharer/sharer.php?u=" + url,
  };
}
