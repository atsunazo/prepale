import Link from "next/link";

export default function HomePage() {
  return (
	<main className="cover-page">
  	<div className="cover-ornament cover-ornament-a" />
  	<div className="cover-ornament cover-ornament-b" />
  	<div className="cover-ornament cover-ornament-c" />

  	<section className="cover-sheet">
    	<div className="cover-kicker">PROFILE BOOK</div>
    	<h1 className="cover-title">プレパレ！</h1>
    	<p className="cover-subtitle">みんなのプロフィール帳</p>

    	<p className="cover-copy">
      	ページをめくりながら、参加メンバーのことをゆっくり知れる
      	プロフィール帳です。
    	</p>

    	<Link href="/book" className="cover-button">
      	プロフィール帳をひらく
    	</Link>
  	</section>
	</main>
  );
}
``


