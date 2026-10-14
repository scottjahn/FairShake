import { withBase } from "./basePath";

const REPO_URL = "https://github.com/scottjahn/FairShake";
const CONTACT_EMAIL = "scott.jahn@gmail.com";

/**
 * Site footer. The admin panel only exists under `npm run dev`, so the Admin
 * link is left out of the published build; in admin it becomes "Public site".
 */
export default function Footer({ admin = false }: { admin?: boolean }) {
  return (
    <footer className="sitefoot">
      {admin && <><a href={withBase("/")}>Public site</a><span aria-hidden>•</span></>}
      {!admin && import.meta.env.DEV && <><a href={withBase("/admin")}>Admin</a><span aria-hidden>•</span></>}
      <a href={`mailto:${CONTACT_EMAIL}?subject=FairShake%20feedback`}>Feedback</a>
      <span aria-hidden>•</span>
      <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">Issues</a>
    </footer>
  );
}
