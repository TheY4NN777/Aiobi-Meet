<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
        ${messageHeader}
        <#else>
        ${message.summary}
        </#if>
    <#elseif section = "form">
    <div id="kc-info-message" style="text-align:center;">
        <p class="instruction" style="font-size:15px;line-height:1.6;margin:8px 0 24px 0;">
            ${message.summary}<#if requiredActions??><#list requiredActions>: <b><#items as reqActionItem>${msg("requiredAction.${reqActionItem}")}<#sep>, </#items></b></#list><#else></#if>
        </p>
        <#if skipLink??>
        <#else>
            <#-- Prominent CTA button back to the app. Used notably after email
                 verification when the mail was opened in a different browser/app
                 (e.g. Gmail mobile in-app browser) where the auth session cookie
                 is not available, so Keycloak can't resume the original login. -->
            <#assign continueHref = "">
            <#if pageRedirectUri?has_content>
                <#assign continueHref = pageRedirectUri>
            <#elseif actionUri?has_content>
                <#assign continueHref = actionUri>
            <#elseif (client.baseUrl)?has_content>
                <#assign continueHref = client.baseUrl + "authenticate/?returnTo=/home">
            </#if>
            <div style="margin:20px 0 8px 0;">
                <a href="${continueHref?has_content?then(continueHref, '/authenticate/?returnTo=/home')}" class="pf-c-button pf-m-primary pf-m-block btn-lg" style="display:inline-block;padding:14px 32px;background-color:#4A3C5C;color:#ffffff;font-family:'Roboto',-apple-system,BlinkMacSystemFont,sans-serif;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;border:none;min-width:220px;text-align:center;">
                    Se connecter &rarr;
                </a>
            </div>
        </#if>
    </div>
    </#if>
</@layout.registrationLayout>
