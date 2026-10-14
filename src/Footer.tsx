import { withBase } from "./basePath";

const REPO_URL = "https://github.com/scottjahn/FairShake";
const CONTACT_EMAIL = "scott.jahn@gmail.com";

/** Site footer. In admin, the first link goes back to the public site instead. */
export default function Footer({ admin = false }: { admin?: boolean }) {
  return (
    <footer className="sitefoot">
      {admin
        ? <a href={withBase("/")}>Public site</a>
        : <a href={withBase("/admin")}>Admin</a>}
      <span aria-hidden>•</span>
      <a href={`mailto:${CONTACT_EMAIL}?subject=FairShake%20feedback`}>Feedback</a>
      <span aria-hidden>•</span>
      <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">Issues</a>
    </footer>
  );
}
