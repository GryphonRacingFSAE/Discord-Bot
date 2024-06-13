#[allow(dead_code)]
fn main() {
    println!("cargo:rerun-if-changed=./migrations"); // ensure migrations are built at compile time
}
