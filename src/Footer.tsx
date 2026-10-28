import { pathHref } from "./route";

const REPO_URL = "https://github.com/scottjahn/FairShake";
const CONTACT_EMAIL = "scott.jahn@gmail.com";

/**
 * Site footer. The admin panel only exists under `npm run dev`, so the Admin
 * link is left out of the offline build; in admin it becomes "Public site".
 */
export default function Footer({ admin = false }: { admin?: boolean }) {
  return (
    <footer className="sitefoot">
      {admin && <><a href={pathHref("/")}>Public site</a><span aria-hidden>•</span></>}
      {!admin && import.meta.env.DEV && <><a href={pathHref("/admin")}>Admin</a><span aria-hidden>•</span></>}
      <a href={`mailto:${CONTACT_EMAIL}?subject=FairShake%20feedback`}>Feedback</a>
      <span aria-hidden>•</span>
      <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">Issues</a>
    </footer>
  );
}
