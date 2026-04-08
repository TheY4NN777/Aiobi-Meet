<#macro emailLayout>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${properties.brandName!"Aïobi Meet"}</title>
  <style>
    /* Client resets */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    /* Responsive */
    @media screen and (max-width: 600px) {
      .wrapper { width: 100% !important; padding: 12px !important; }
      .content-cell { padding: 16px !important; }
      .btn { padding: 12px 22px !important; font-size: 15px !important; }
      .title { font-size: 22px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${properties.colorBgPage!'#f4f0fa'};font-family:'Roboto',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:${properties.colorNoir!'#0F1010'};">
  <!-- Spacer -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td height="32" style="height:32px;line-height:32px;font-size:0;">&nbsp;</td></tr>
  </table>

  <!-- Main wrapper -->
  <table role="presentation" class="wrapper" align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;margin:0 auto;">

    <!-- Logo header (white band, matches MJML templates) -->
    <tr>
      <td align="center" bgcolor="#ffffff" style="padding:24px 16px;border-top-left-radius:16px;border-top-right-radius:16px;border-bottom:2px solid #f4f0fa;">
        <img src="${properties.logoUrl!'https://aiobi-meet.duckdns.org:8443/assets/logo-banner.png'}" alt="${properties.brandName!'Aïobi Meet'}" width="160" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;">
      </td>
    </tr>

    <!-- Content card -->
    <tr>
      <td class="content-cell" bgcolor="#ffffff" style="padding:32px 32px 24px 32px;border-bottom-left-radius:16px;border-bottom-right-radius:16px;">
        <#nested>
      </td>
    </tr>

    <!-- Footer spacing -->
    <tr><td height="24" style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>

    <!-- Footer -->
    <tr>
      <td align="center" style="padding:0 16px 40px 16px;font-size:12px;color:${properties.colorTextMuted!'#8b8ba3'};font-family:'Roboto',Helvetica,Arial,sans-serif;line-height:1.6;">
        <p style="margin:0 0 6px 0;">
          ${properties.brandName!"Aïobi Meet"} &mdash; ${properties.brandTagline!"La visioconférence souveraine"}
        </p>
        <p style="margin:0;">
          Besoin d'aide&nbsp;? <a href="mailto:${properties.supportEmail!'support@aiobi.world'}" style="color:${properties.colorViolet!'#a251fc'};text-decoration:none;">${properties.supportEmail!"support@aiobi.world"}</a>
        </p>
      </td>
    </tr>

  </table>
</body>
</html>
</#macro>

<#macro button href label>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
  <tr>
    <td align="center" bgcolor="${properties.colorViolet!'#a251fc'}" style="border-radius:8px;">
      <a class="btn" href="${href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'Roboto',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
</#macro>
