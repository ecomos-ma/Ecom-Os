import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRAND = "Ecom OS";
const CANONICAL_DOMAIN = "https://www.ecomos.ma";
const DEFAULT_IMAGE = "https://www.ecomos.ma/icon-512.png";

const seoMapping = {
    "/": {
        title: "Ecom OS — All-in-One COD E-commerce Operating System",
        description: "Manage COD orders, confirmation, shipping, inventory, finance, WhatsApp automation and integrations from one platform built for modern e-commerce teams."
    },
    "/pricing": {
        title: "Ecom OS Pricing — Plans for COD Sellers",
        description: "Explore Ecom OS plans for COD sellers and growing e-commerce teams. Manage orders, shipping, automation, inventory and operations from one platform."
    },
    "/features": {
        title: "Ecom OS Features — Orders, Shipping, CRM & Automation",
        description: "Discover all Ecom OS features including advanced order management, shipping tracking, CRM tools, WhatsApp automation, and inventory control for COD sellers."
    },
    "/integrations": {
        title: "Ecom OS Integrations — YouCan, WhatsApp, Shipping & More",
        description: "Connect Ecom OS with your favorite e-commerce platforms like YouCan, automate with WhatsApp, and sync seamlessly with leading shipping providers."
    },
    "/contact": {
        title: "Contact Ecom OS — Support & Sales",
        description: "Get in touch with the Ecom OS team for support, sales inquiries, or partnership opportunities. We're here to help your COD business grow."
    },
    "/privacy": {
        title: "Privacy Policy — Ecom OS",
        description: "Read the Ecom OS Privacy Policy to understand how we collect, use, and protect your data while you manage your e-commerce business."
    },
    "/terms": {
        title: "Terms of Service — Ecom OS",
        description: "Review the Ecom OS Terms of Service. These terms govern your use of our platform for COD order management and e-commerce operations."
    },
    "/refund-policy": {
        title: "Refund Policy — Ecom OS",
        description: "Learn about the Ecom OS refund policy, subscription cancellations, and billing terms for our e-commerce operating system."
    },
    "/data-deletion": {
        title: "Data Deletion Request — Ecom OS",
        description: "Submit a data deletion request to Ecom OS. We respect your privacy and provide a seamless process to remove your information."
    },
    "/account-deletion": {
        title: "Delete Your Ecom OS Account",
        description: "Instructions on how to permanently delete your Ecom OS account and associated workspace data."
    }
};

const distPath = path.resolve(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');

if (!fs.existsSync(indexPath)) {
    console.error("❌ dist/index.html not found. Make sure to run vite build first.");
    process.exit(1);
}

const template = fs.readFileSync(indexPath, 'utf-8');

const globalSchema = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "name": "Ecom OS",
          "url": "https://www.ecomos.ma",
          "logo": "https://www.ecomos.ma/icon-512.png"
        },
        {
          "@type": "WebSite",
          "name": "Ecom OS",
          "url": "https://www.ecomos.ma"
        },
        {
          "@type": "SoftwareApplication",
          "name": "Ecom OS",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "url": "https://www.ecomos.ma"
        }
      ]
    }
    </script>
`;

for (const [route, metadata] of Object.entries(seoMapping)) {
    const canonicalUrl = `${CANONICAL_DOMAIN}${route === "/" ? "" : route}`;

    let html = template;

    // Replace Title
    html = html.replace(/<title>.*?<\/title>/, `<title>${metadata.title}</title>`);

    // Inject Meta tags before </head>
    const tagsToInject = `
    <meta name="description" content="${metadata.description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${metadata.title}" />
    <meta property="og:description" content="${metadata.description}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${BRAND}" />
    <meta property="og:image" content="${DEFAULT_IMAGE}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${metadata.title}" />
    <meta name="twitter:description" content="${metadata.description}" />
    <meta name="twitter:image" content="${DEFAULT_IMAGE}" />
    <meta name="robots" content="index, follow" />
    ${route === '/' ? globalSchema : ''}
  `;

    html = html.replace('</head>', `${tagsToInject}</head>`);

    // Write file
    if (route === "/") {
        fs.writeFileSync(indexPath, html);
        console.log(`✅ Prerendered root /`);
    } else {
        // For specific routes, ensure the directory exists and write an index.html there.
        // e.g. dist/pricing/index.html
        const dir = path.join(distPath, route);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(path.join(dir, 'index.html'), html);
        console.log(`✅ Prerendered ${route}`);
    }
}

console.log("🎉 SEO Prerendering complete!");
