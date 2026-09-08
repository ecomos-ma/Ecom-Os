import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface PageSEO {
    title: string;
    description: string;
}

const BRAND = "Ecom OS";
const CANONICAL_DOMAIN = "https://www.ecomos.ma";
const DEFAULT_IMAGE = "https://www.ecomos.ma/icon-512.png";

const seoMapping: Record<string, PageSEO> = {
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

const updateTag = (tagName: string, attrName: string, attrValue: string, content: string) => {
    let element = document.head.querySelector(`${tagName}[${attrName}="${attrValue}"]`);
    if (!element) {
        element = document.createElement(tagName);
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
    }
    if (tagName === "meta") {
        element.setAttribute("content", content);
    } else if (tagName === "link" && attrName === "rel") {
        element.setAttribute("href", content);
    }
};

const removeTag = (tagName: string, attrName: string, attrValue: string) => {
    const element = document.head.querySelector(`${tagName}[${attrName}="${attrValue}"]`);
    if (element) {
        document.head.removeChild(element);
    }
};

export function SEOManager() {
    const { pathname } = useLocation();

    useEffect(() => {
        // Determine if exact match exists in seoMapping.
        const cleanPath = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
        const pageData = seoMapping[cleanPath];

        if (pageData) {
            // 1. IS PUBLIC PAGE
            document.title = pageData.title;

            // Basic Meta
            updateTag("meta", "name", "description", pageData.description);

            // Robots - Allow indexing
            updateTag("meta", "name", "robots", "index, follow");

            // Canonical
            const canonicalUrl = `${CANONICAL_DOMAIN}${cleanPath === "/" ? "" : cleanPath}`;
            updateTag("link", "rel", "canonical", canonicalUrl);

            // Open Graph
            updateTag("meta", "property", "og:title", pageData.title);
            updateTag("meta", "property", "og:description", pageData.description);
            updateTag("meta", "property", "og:url", canonicalUrl);
            updateTag("meta", "property", "og:type", "website");
            updateTag("meta", "property", "og:site_name", BRAND);
            updateTag("meta", "property", "og:image", DEFAULT_IMAGE);

            // Twitter
            updateTag("meta", "name", "twitter:card", "summary_large_image");
            updateTag("meta", "name", "twitter:title", pageData.title);
            updateTag("meta", "name", "twitter:description", pageData.description);
            updateTag("meta", "name", "twitter:image", DEFAULT_IMAGE);

        } else {
            // 2. IS PRIVATE / UNKNOWN PAGE (NOINDEX)
            document.title = `${BRAND} Dashboard`;

            // Robots - Block indexing
            updateTag("meta", "name", "robots", "noindex, nofollow");

            // Remove SEO-specific tags that shouldn't be indexed to avoid duplicate meta issues.
            removeTag("meta", "name", "description");
            removeTag("link", "rel", "canonical");
            removeTag("meta", "property", "og:title");
            removeTag("meta", "property", "og:description");
            removeTag("meta", "property", "og:url");
            removeTag("meta", "property", "og:type");
            removeTag("meta", "property", "og:site_name");
            removeTag("meta", "property", "og:image");
            removeTag("meta", "name", "twitter:card");
            removeTag("meta", "name", "twitter:title");
            removeTag("meta", "name", "twitter:description");
            removeTag("meta", "name", "twitter:image");
        }
    }, [pathname]);

    return null;
}
