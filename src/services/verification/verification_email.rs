use anyhow::Result;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use rand::Rng;
use std::env::var;
use std::io::Read;

/// Handles dealing with emailing formatting + sending

/// Generates a 7 digit code
pub fn generate_code() -> u64 {
    rand::rngs::OsRng.gen_range(1000000..=9999999)
}

/// Read template file
fn read_html_template(file_path: &str) -> Result<String> {
    let mut file = std::fs::File::open(file_path)?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)?;
    Ok(contents)
}

/// Sends out an email
pub async fn send_email(recipient: lettre::message::Mailbox, code: u64) -> Result<()> {
    let body: String = read_html_template("./src/verification_email.html")?
        .replace("{{code}}", code.to_string().as_str());
    let email = lettre::Message::builder()
        .from(var("EMAIL_USERNAME")?.parse()?)
        .to(recipient)
        .subject("Gryphon FSAE Discord verification code")
        .singlepart(lettre::message::SinglePart::html(body))?;
    let creds: Credentials = Credentials::new(
        var("EMAIL_USERNAME").unwrap(),
        var("EMAIL_APP_PASSWORD").unwrap(),
    );
    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(var("SMTP_SERVER").unwrap().as_str())?
            .credentials(creds)
            .build();
    mailer.send(email).await?;
    Ok(())
}
