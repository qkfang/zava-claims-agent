using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;

namespace ZavaClaims.App.Services;

public class NotificationService
{
    private readonly ILogger<NotificationService> _logger;
    private readonly string? _smtpHost;
    private readonly int _smtpPort;
    private readonly string? _smtpUser;
    private readonly string? _smtpPassword;
    private readonly string _fromAddress;
    private readonly bool _enableSsl;

    public NotificationService(IConfiguration configuration, ILogger<NotificationService> logger)
    {
        _logger = logger;
        _smtpHost = configuration["SMTP_HOST"];
        _smtpPort = int.TryParse(configuration["SMTP_PORT"], out var p) ? p : 587;
        _smtpUser = configuration["SMTP_USER"];
        _smtpPassword = configuration["SMTP_PASSWORD"];
        _fromAddress = configuration["SMTP_FROM"] ?? "noreply@example.com";
        _enableSsl = !bool.TryParse(configuration["SMTP_ENABLE_SSL"], out var ssl) || ssl;
    }

    public async Task<string> SendEmailAsync(string to, string subject, string body)
    {
        if (string.IsNullOrWhiteSpace(_smtpHost))
        {
            _logger.LogInformation("SMTP not configured; skipping send. To={To} Subject={Subject}",
                Sanitize(to), Sanitize(subject));
            return $"SMTP not configured. Email to '{to}' with subject '{subject}' was logged only.";
        }

        using var message = new MailMessage(_fromAddress, to, subject, body);
        using var smtp = new SmtpClient(_smtpHost, _smtpPort) { EnableSsl = _enableSsl };
        if (!string.IsNullOrEmpty(_smtpUser))
        {
            smtp.Credentials = new NetworkCredential(_smtpUser, _smtpPassword);
        }

        _logger.LogInformation("Sending email to {To} subject {Subject}", Sanitize(to), Sanitize(subject));
        await smtp.SendMailAsync(message);
        return $"Email sent to '{to}'.";
    }

    private static string Sanitize(string value) =>
        value.Replace('\r', ' ').Replace('\n', ' ');
}
