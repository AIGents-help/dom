export const metadata = {
  title: "Terms of Service | Drone Operation Management",
};

const EFFECTIVE_DATE = "July 9, 2026";

export default function TermsPage() {
  return (
    <>
      <section className="border-b border-border bg-grid-fade">
        <div className="container-app py-24">
          <p className="eyebrow mb-4">Terms of Service</p>
          <h1 className="heading-xl max-w-3xl">The terms that govern using DOM.</h1>
          <p className="body-muted mt-6 max-w-2xl text-lg">Effective {EFFECTIVE_DATE}</p>
        </div>
      </section>

      <section className="section">
        <div className="container-app max-w-3xl space-y-10">
          <Block title="1. Acceptance of terms">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of droneopsman.com and the
              services provided by Drone Operation Management (&quot;DOM,&quot; &quot;we,&quot;
              &quot;us&quot;). By requesting a mission, applying as a pilot, or otherwise using our
              services, you agree to these Terms.
            </p>
          </Block>

          <Block title="2. What DOM does">
            <p>
              DOM operates a platform connecting clients who need commercial drone services with
              independent, FAA Part 107 certified remote pilots. DOM's operations team scopes,
              quotes, and coordinates each mission; certified pilots perform the flight and deliver
              the resulting data.
            </p>
            <p>
              Pilots on DOM operate as independent contractors, not employees of DOM. DOM verifies
              Part 107 certification and insurance before a pilot is eligible to accept missions,
              but each pilot is independently responsible for safe and lawful operation of their
              aircraft.
            </p>
          </Block>

          <Block title="3. Client responsibilities">
            <ul>
              <li>Provide accurate mission details — location, scope, site access, and hazards.</li>
              <li>Obtain any property access permissions required for the mission site.</li>
              <li>Pay for services according to the quote you accept.</li>
              <li>Communicate scheduling conflicts or site changes promptly.</li>
            </ul>
          </Block>

          <Block title="4. Pilot responsibilities">
            <ul>
              <li>Maintain a valid FAA Part 107 remote pilot certificate and required liability insurance at all times.</li>
              <li>Comply with all FAA regulations, airspace authorizations, and local laws for every flight.</li>
              <li>Perform missions to the standard described in DOM's mission briefing and SOPs.</li>
              <li>Submit deliverables and documentation in a timely manner.</li>
              <li>Immediately notify DOM of any incident, certificate lapse, or insurance lapse.</li>
            </ul>
          </Block>

          <Block title="5. Payments, fees, and subscriptions">
            <p>
              All payments are processed through Stripe. Mission pricing is calculated from the
              scope, location, airspace classification, and timeline you provide, and is presented
              for confirmation before a mission is booked.
            </p>
            <p>
              DOM collects a commission on missions performed through the platform. Pilots may
              subscribe to a monthly plan that waives DOM's commission on missions the pilot sources
              and creates themselves; subscription fees are billed on a recurring basis until
              cancelled and are non-refundable except as required by law.
            </p>
          </Block>

          <Block title="6. Cancellations and rescheduling">
            <p>
              Missions may need to be rescheduled due to weather, airspace restrictions, or safety
              conditions — DOM will make reasonable efforts to notify you and reschedule promptly.
              Cancellation and refund terms will be confirmed with you at the time of booking.
            </p>
          </Block>

          <Block title="7. Deliverables and intellectual property">
            <p>
              Upon full payment, ownership of the final deliverables produced for your mission
              (imagery, models, reports, and similar outputs) transfers to you, the client. DOM and
              the performing pilot retain the right to use non-confidential mission imagery for
              portfolio and marketing purposes unless you request otherwise in writing.
            </p>
          </Block>

          <Block title="8. Limitation of liability">
            <p>
              DOM coordinates missions performed by independently insured, certified pilots. To the
              maximum extent permitted by law, DOM's total liability for any claim arising from a
              mission is limited to the amount paid for that mission. DOM is not liable for
              indirect, incidental, or consequential damages. Nothing in these Terms limits
              liability that cannot be limited under applicable law.
            </p>
          </Block>

          <Block title="9. Prohibited conduct">
            <ul>
              <li>Using the platform for any unlawful purpose or in violation of FAA regulations.</li>
              <li>Requesting missions that require unauthorized or unsafe flight operations.</li>
              <li>Circumventing DOM's platform to solicit a pilot you were introduced to through DOM for a fee-avoiding, off-platform mission.</li>
              <li>Providing false information about identity, certification, or insurance.</li>
            </ul>
          </Block>

          <Block title="10. Termination">
            <p>
              DOM may suspend or terminate access to the platform for violation of these Terms, at
              its discretion, with or without notice.
            </p>
          </Block>

          <Block title="11. Changes to these terms">
            <p>
              We may update these Terms from time to time. Continued use of DOM after an update
              constitutes acceptance of the revised Terms.
            </p>
          </Block>

          <Block title="12. Governing law">
            <p>
              These Terms are governed by the laws of the Commonwealth of Pennsylvania, without
              regard to conflict-of-law principles.
            </p>
          </Block>

          <Block title="13. Contact us">
            <p>
              Questions about these Terms? Email{" "}
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
