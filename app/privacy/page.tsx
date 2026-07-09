export const metadata = {
  title: "Privacy Policy | Drone Operation Management",
};

const EFFECTIVE_DATE = "July 9, 2026";

export default function PrivacyPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Privacy Policy</p>
          <h1 className="heading-xl max-w-3xl">How we handle your information.</h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">Effective {EFFECTIVE_DATE}</p>
        </div>
      </section>

      <section className="section">
        <div className="container-app max-w-3xl space-y-10">
          <Block title="1. Who we are">
            <p>
              Drone Operation Management (&quot;DOM,&quot; &quot;we,&quot; &quot;us&quot;) operates
              droneopsman.com and provides commercial drone mission services connecting clients
              with FAA Part 107 certified remote pilots. This policy explains what information we
              collect, how we use it, and the choices you have.
            </p>
          </Block>

          <Block title="2. Information we collect">
            <p>We collect information directly from you and automatically as you use our services:</p>
            <ul>
              <li>
                <strong>Contact and account information</strong> — name, email, phone, company, and
                (for pilots) FAA Part 107 certificate number, insurance details, service area, and
                equipment, provided when you request a mission, apply as a pilot, or create an
                account.
              </li>
              <li>
                <strong>Mission details</strong> — site location, service scope, and any documents,
                photos, or files you or your pilot upload in connection with a mission.
              </li>
              <li>
                <strong>Payment information</strong> — processed directly by our payment processor,
                Stripe. We do not store your full card number or bank details on our own servers.
              </li>
              <li>
                <strong>Usage data</strong> — standard technical data such as IP address, browser
                type, and pages visited, collected automatically to operate and secure the site.
              </li>
            </ul>
          </Block>

          <Block title="3. How we use your information">
            <ul>
              <li>To scope, quote, schedule, and deliver drone missions.</li>
              <li>To verify pilot certification and insurance before assigning work.</li>
              <li>To process payments, subscriptions, and payouts.</li>
              <li>To send transactional emails — booking confirmations, mission updates, deliverable notifications, and payout notices.</li>
              <li>To maintain the security and integrity of our platform.</li>
              <li>To comply with legal and FAA regulatory obligations.</li>
            </ul>
          </Block>

          <Block title="4. Who we share it with">
            <p>
              We do not sell your personal information. We share it only with the service
              providers that help us operate DOM, and only as needed to provide the service:
            </p>
            <ul>
              <li><strong>Stripe</strong> — payment processing, subscription billing, and pilot payouts.</li>
              <li><strong>Resend</strong> — transactional email delivery.</li>
              <li><strong>Supabase</strong> — database hosting, authentication, and file storage.</li>
              <li><strong>Notion</strong> — internal CRM record-keeping for our operations team.</li>
              <li><strong>Mapping and airspace data providers</strong> (e.g. OpenStreetMap, aviation airspace APIs) — to classify airspace for a mission location.</li>
              <li>The assigned pilot or client for a given mission, limited to what's needed to complete that mission.</li>
              <li>Law enforcement or regulators, where required by law.</li>
            </ul>
          </Block>

          <Block title="5. Data retention">
            <p>
              We retain mission, account, and payment records for as long as needed to provide the
              service, meet accounting and tax obligations, and resolve disputes. You can request
              deletion of your account information at any time (see Section 8), subject to records
              we're required to keep for legal or regulatory reasons.
            </p>
          </Block>

          <Block title="6. Security">
            <p>
              We use industry-standard safeguards — encrypted connections, access-controlled
              databases, and role-based permissions — to protect your information. No system is
              perfectly secure, and we can't guarantee absolute security of data transmitted to us.
            </p>
          </Block>

          <Block title="7. Cookies">
            <p>
              We use minimal, functional cookies required to keep you signed in to the admin and
              pilot portals. We do not use third-party advertising or tracking cookies.
            </p>
          </Block>

          <Block title="8. Your rights">
            <p>
              You may request access to, correction of, or deletion of your personal information by
              emailing{" "}
              <a href="mailto:ops@droneopsman.com" className="text-accent hover:underline">
                ops@droneopsman.com
              </a>
              . We'll respond within a reasonable time.
            </p>
          </Block>

          <Block title="9. Children's privacy">
            <p>DOM's services are intended for business and commercial use and are not directed at children under 13.</p>
          </Block>

          <Block title="10. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be reflected by
              updating the effective date above.
            </p>
          </Block>

          <Block title="11. Contact us">
            <p>
              Questions about this policy? Email{" "}
              <a href="mailto:ops@droneopsman.com" className="text-accent hover:underline">
                ops@droneopsman.com
              </a>
              .
            </p>
          </Block>
        </div>
      </section>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="heading-lg mb-4 text-2xl">{title}</h2>
      <div className="body-muted space-y-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_strong]:text-white">
        {children}
      </div>
    </div>
  );
}
