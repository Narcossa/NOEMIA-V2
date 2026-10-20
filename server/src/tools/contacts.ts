// Contacts Google : retrouver « Sophie » ou « Maman » pour un email, un SMS ou un appel.
import { google } from "googleapis";
import { allClients } from "../google.ts";
import { tool, str } from "./types.ts";

export const contactTools = [
  tool("contacts_chercher", "Cherche un contact (nom, surnom, relation comme « Maman ») : e-mails et numéros de téléphone.",
    { nom: str("Nom ou partie du nom") }, ["nom"],
    async (ctx, { nom }) => {
      const out: any[] = [];
      for (const { auth, account } of allClients(ctx.userId)) {
        const people = google.people({ version: "v1", auth });
        const fields = "names,emailAddresses,phoneNumbers,nicknames,relations";
        // La recherche Google exige une requête « à blanc » pour réchauffer son cache
        await people.people.searchContacts({ query: "", readMask: fields }).catch(() => {});
        const r = await people.people.searchContacts({ query: nom, readMask: fields, pageSize: 10 });
        const o = await people.otherContacts.search({ query: nom, readMask: "names,emailAddresses,phoneNumbers", pageSize: 5 }).catch(() => null);
        for (const res of [...(r.data.results ?? []), ...(o?.data.results ?? [])]) {
          const p = res.person!;
          out.push({ compte: account.label, nom: p.names?.[0]?.displayName, surnom: p.nicknames?.[0]?.value,
            emails: p.emailAddresses?.map(e => e.value), telephones: p.phoneNumbers?.map(t => t.canonicalForm ?? t.value) });
        }
      }
      return out.length ? out : { resultat: "Aucun contact trouvé. Demande l'adresse ou le numéro à l'utilisateur." };
    }),
];
