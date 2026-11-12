import { mkdir, writeFile } from "node:fs/promises";
import { homePage, privacyPage } from "../../server/public-pages.ts";

const contact = process.env.PUBLIC_PRIVACY_CONTACT?.trim();
if (!contact || !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(contact)) {
  throw new Error("Configura PUBLIC_PRIVACY_CONTACT con el correo de soporte.");
}
const siteVerification = process.env.GOOGLE_SITE_VERIFICATION;
if (siteVerification && !/^[a-zA-Z0-9_-]{1,200}$/.test(siteVerification)) {
  throw new Error(
    "GOOGLE_SITE_VERIFICATION debe contener solo el valor de content.",
  );
}

const output = new URL("../../dist/public-site/", import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(
    new URL("index.html", output),
    homePage({
      accessUrl: "https://wiseload.onrender.com/#/acceso",
      privacyUrl: "/privacidad.html",
      siteVerification,
    }),
  ),
  writeFile(new URL("privacidad.html", output), privacyPage(contact, "/")),
  writeFile(new URL("robots.txt", output), "User-agent: *\nDisallow:\n"),
]);
