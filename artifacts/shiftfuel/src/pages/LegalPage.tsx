import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

interface LegalContent {
  title: string;
  updated: string;
  sections: { heading: string; content: string }[];
}

const PRIVACY: LegalContent = {
  title: "Privacy Policy",
  updated: "June 24, 2026",
  sections: [
    { heading: "Information We Collect", content: "ShiftFuel Concierge collects the information needed to provide vehicle concierge services, including your name, phone number, email address, service address, approximate location coordinates for your service address, gas station preferences, parking and key handoff details, vehicle details, service selections, payment authorization details, photos, receipts, request status updates, and any messages or notes you submit." },
    { heading: "How We Use Information", content: "We use this information to create and manage service requests, verify customer and worker access, coordinate vehicle pickup and return, process payment authorizations and final charges, provide tracking updates, maintain customer history, improve operations, and respond to support, safety, payment, or dispute issues." },
    { heading: "Payments", content: "Payment information is handled through our payment processor. ShiftFuel Concierge does not store full card numbers. We may store payment identifiers, authorization status, charge status, totals, receipt records, and related transaction information so we can complete, adjust, cancel, or release authorized payments." },
    { heading: "Service Communications", content: "We may use your phone number, email address, or in-app information to send service-related updates, including booking confirmations, request status updates, worker updates, payment updates, cancellation updates, and support messages." },
    { heading: "Sharing", content: "We share information only as needed to operate the service, including with payment processors, assigned service workers, hosting and database providers, mapping and location providers, support tools, and legal or safety authorities when required. We use third-party mapping providers to validate service areas, suggest addresses, find nearby gas stations, and calculate driving distances; for these features your service address or coordinates are sent to that provider to return results. We do not sell customer personal information." },
    { heading: "Photos and Service Records", content: "ShiftFuel Concierge may collect pickup photos, return photos, odometer photos, fuel gauge photos, receipt photos, and condition documentation to verify service completion, support customer tracking, review payment totals, and help resolve disputes." },
    { heading: "Data Retention", content: "We retain service records, photos, receipts, payment records, and operational logs as needed for customer history, reporting, dispute handling, safety, tax, insurance, and legal purposes. Saved customer addresses and vehicles may be removed from future booking options without deleting past request records." },
    { heading: "Your Choices", content: "You may contact ShiftFuel Concierge to request help updating contact information, saved vehicles, saved service addresses, or other account details. Some historical request records may need to be retained for business, payment, safety, tax, insurance, or legal reasons." },
    { heading: "Contact", content: "For privacy-related questions, data requests, or concerns, contact us at: ShiftFuel Concierge — Email: m.urban3@aol.com" },
    { heading: "Governing Law", content: "This Privacy Policy is governed by the laws of the State of Delaware, without regard to its conflict of law provisions." },
  ],
};

const TERMS: LegalContent = {
  title: "Terms of Service",
  updated: "June 24, 2026",
  sections: [
    { heading: "Use of ShiftFuel Concierge", content: "By booking or using ShiftFuel Concierge, you agree to provide accurate customer, vehicle, service address, parking, key handoff, and payment information. You confirm that you are authorized to request service for the vehicle and to provide access to the vehicle and keys." },
    { heading: "Service Availability", content: "Service availability is confirmed during booking. ShiftFuel Concierge may deny, cancel, reschedule, or modify a request when service cannot be safely or reasonably completed, including due to location, weather, vehicle access, payment issues, worker availability, inaccurate information, safety concerns, or service limitations." },
    { heading: "Payment Authorization and Final Charges", content: "Your payment method may be authorized when you book. You are not charged until service is completed, unless a cancellation, return request, or service interruption after keys are received or service has started results in an applicable cancellation, return, or service fee. Final totals may include selected service fees, add-ons, actual fuel or car wash receipt totals, approved adjustments, and payment or operating recovery already included in customer-facing service prices." },
    { heading: "Gas Station Selection and Distance Surcharge", content: "For fuel services, ShiftFuel Concierge fuels your vehicle at the closest available gas station to your service address at no additional charge. You may instead select a different, farther gas station. If you do, a distance surcharge of $0.75 for each additional round-trip mile beyond the closest station applies, calculated from driving distances and added to your authorized total before you confirm booking." },
    { heading: "Cancellations and Return Requests", content: "You may cancel before keys are received according to the app workflow. After keys are received or service has started, direct cancellation may not be available from the app. You may request vehicle return, and completed receipt totals, cancellation fees, return fees, service fees, or payment processing-related costs may apply depending on the stage of the request." },
    { heading: "Customer Responsibilities", content: "You are responsible for providing safe and lawful parking, accurate key handoff instructions, clear vehicle identification, and a vehicle condition suitable for the requested service. You must remove or secure personal items and disclose any vehicle condition that could affect safe service." },
    { heading: "Photos and Documentation", content: "You agree that ShiftFuel Concierge may take pickup, return, odometer, fuel gauge, receipt, and condition photos to document the service. These records may be used for customer tracking, service verification, support, payment review, safety review, or dispute handling." },
    { heading: "Refusal or Incomplete Service", content: "ShiftFuel Concierge may refuse, pause, return, or mark a service incomplete if the vehicle cannot be safely accessed, moved, fueled, washed, serviced, or returned." },
    { heading: "Acceptance of Terms", content: "By submitting a booking request through ShiftFuel Concierge, you confirm that you have read, understood, and agreed to these Terms of Service, the Privacy Policy, and the Liability Waiver." },
    { heading: "Updates to These Terms", content: "ShiftFuel Concierge may update these terms as the service changes. Continued use of the service after updates means you accept the updated terms." },
    { heading: "Governing Law", content: "These Terms of Service are governed by the laws of the State of Delaware, without regard to its conflict of law provisions." },
    { heading: "Contact", content: "For questions about these terms, contact us at: ShiftFuel Concierge — Email: m.urban3@aol.com" },
  ],
};

const LIABILITY: LegalContent = {
  title: "Liability Waiver",
  updated: "June 24, 2026",
  sections: [
    { heading: "Authorization to Access and Move Vehicle", content: "By submitting a service request, you authorize ShiftFuel Concierge and its assigned workers to access, start, move, park, fuel, wash, visually inspect, photograph, and return your vehicle as reasonably needed to complete the selected service." },
    { heading: "Vehicle Condition and Personal Property", content: "You agree that the vehicle is safe to operate and free from undisclosed mechanical, electrical, tire, brake, steering, lock, alarm, fuel-system, or drivability issues that could affect service. You are responsible for removing or securing personal property, valuables, cash, electronics, toll devices, documents, weapons, medications, and sensitive items before service. ShiftFuel Concierge is not responsible for unsecured, hidden, loose, fragile, valuable, or sensitive personal items left in the vehicle, except where required by law." },
    { heading: "Normal Service Risks", content: "You understand that vehicle concierge services involve ordinary risks, including parking lot movement, third-party fuel or wash facilities, weather, road conditions, existing vehicle damage, manufacturer issues, loose trim, aftermarket accessories, alarms, and pre-existing mechanical problems." },
    { heading: "Photos and Documentation", content: "ShiftFuel Concierge may take pickup, return, odometer, fuel gauge, receipt, and condition photos to document the service. These records may be used for customer tracking, service verification, support, payment review, safety review, insurance review, or dispute handling." },
    { heading: "Limitation of Liability", content: "ShiftFuel Concierge and its workers are not liable for pre-existing vehicle damage or mechanical issues, unsecured personal property or valuables, ordinary wear and exposure from movement or weather, damage caused by pre-existing issues not disclosed at booking, third-party facility conditions, or incidents outside of reasonable service actions. ShiftFuel Concierge's maximum liability for any service incident is limited to the service fees paid for that request, except where required by applicable law." },
    { heading: "Acknowledgment and Agreement", content: "By submitting a service request, you confirm that you have read, understood, and voluntarily agreed to this Liability Waiver, and that the vehicle is safe for a service worker to operate and return." },
    { heading: "Governing Law", content: "This Liability Waiver is governed by the laws of the State of Delaware, without regard to its conflict of law provisions." },
  ],
};

function LegalDoc({ content }: { content: LegalContent }) {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="eyebrow">Legal</p>
        <h1>{content.title}</h1>
        <p className="legal-updated">Last updated: {content.updated}</p>
        {content.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            <p>{s.content}</p>
          </section>
        ))}
      </article>
    </main>
  );
}

export function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | ShiftFuel Concierge";
    document.body.className = "landing-page legal-page";
    return () => { document.body.className = ""; };
  }, []);
  return (<><SiteHeader /><LegalDoc content={PRIVACY} /><SiteFooter /></>);
}

export function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service | ShiftFuel Concierge";
    document.body.className = "landing-page legal-page";
    return () => { document.body.className = ""; };
  }, []);
  return (<><SiteHeader /><LegalDoc content={TERMS} /><SiteFooter /></>);
}

export function LiabilityWaiverPage() {
  useEffect(() => {
    document.title = "Liability Waiver | ShiftFuel Concierge";
    document.body.className = "landing-page legal-page";
    return () => { document.body.className = ""; };
  }, []);
  return (<><SiteHeader /><LegalDoc content={LIABILITY} /><SiteFooter /></>);
}
