import IconOzon from "../assets/integrationicon/imgi_27_ozonexpress.jpg";
import IconAmeex from "../assets/integrationicon/imgi_28_ameex.jpg";
import IconLivo from "../assets/integrationicon/imgi_30_livo.png";
import IconDigylog from "../assets/integrationicon/imgi_31_digylog.jpg";
import IconYouCan from "../assets/integrationicon/imgi_32_youcan.png";
import IconGoogleSheet from "../assets/integrationicon/imgi_33_google sheet.png";
import IconColiaty from "../assets/integrationicon/imgi_34_coliaty.jpg";
import IconMeta from "../assets/integrationicon/imgi_35_meta.jpg";
import IconForceLog from "../assets/integrationicon/imgi_36_forcelog.jpg";
import IconWhatsApp from "../assets/integrationicon/imgi_37_whatssap.png";
import IconShopify from "../assets/integrationicon/imgi_38_shopify.png";
import IconSendit from "../assets/integrationicon/imgi_40_sendit.png";
import IconTikTok from "../assets/integrationicon/imgi_39_tiktok.png";

export const integrationLogos = {
  ozon: IconOzon,
  ameex: IconAmeex,
  youcan: IconYouCan,
  google: IconGoogleSheet,
  google_sheets: IconGoogleSheet,
  coliaty: IconColiaty,
  meta: IconMeta,
  forcelog: IconForceLog,
  whatsapp: IconWhatsApp,
  shopify: IconShopify,
  sendit: IconSendit,
  tiktok: IconTikTok,
  livo: IconLivo,
  digylog: IconDigylog,
} as const;

export type IntegrationLogoKey = keyof typeof integrationLogos;

export function getIntegrationLogo(key: string): string | undefined {
  return integrationLogos[key as IntegrationLogoKey];
}
