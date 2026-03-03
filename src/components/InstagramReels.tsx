import { useState, useEffect } from 'react';

interface Post {
    id: string;
    permalink: string;
    mediaUrl: string;
    thumbnailUrl?: string;
    mediaType: string;
    isReel?: boolean;
    caption: string;
    sizes: {
        medium: {
            mediaUrl: string;
        };
    };
    likeCount?: number;
}

export default function InstagramReels() {
    const [reels, setReels] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReels = async () => {
            try {
                const res = await fetch('https://feeds.behold.so/RVqh8VIima5lSF9u1b3q');
                if (res.ok) {
                    const data = await res.json();
                    // Filter for reels and take the last 3
                    const allPosts = data.posts || [];
                    const filteredReels = allPosts
                        .filter((post: Post) => post.isReel || post.mediaType === 'VIDEO')
                        .slice(0, 3);
                    setReels(filteredReels);
                }
            } catch (e) {
                console.error("Error fetching reels:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchReels();
    }, []);

    if (loading) {
        return (
            <section className="instagram-reels-section">
                <div className="container">
                    <div className="reels-grid">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="reel-skeleton"></div>
                        ))}
                    </div>
                </div>
            </section>
        );
    }

    if (reels.length === 0) return null;

    return (
        <section className="instagram-reels-section">
            <div className="container">
                <div className="reels-section-header">
                    <h2 className="reels-section-title">BLOG</h2>
                    <p className="reels-section-description">
                        Ropa, zapatos 100 % cuero y accesorios diseñados para hombres contemporáneos que valoran la calidad, el detalle y el carácter.
                    </p>
                </div>
                <div className="reels-grid">
                    {reels.map((reel) => (
                        <a
                            key={reel.id}
                            href={reel.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="reel-card"
                        >
                            <div className="reel-image-container">
                                <img
                                    src={reel.thumbnailUrl || reel.sizes.medium.mediaUrl}
                                    alt={reel.caption}
                                    className="reel-image"
                                    loading="lazy"
                                />
                                <div className="reel-overlay">
                                    <div className="reel-stats">
                                        <i className="fa-regular fa-eye"></i>
                                        <span>{(reel.likeCount || 0) > 100 ? `${((reel.likeCount || 0) * 1234).toLocaleString()}` : '1.2M'}</span>
                                    </div>
                                    <div className="reel-icon">
                                        <i className="fa-solid fa-thumbtack"></i>
                                    </div>
                                </div>
                            </div>
                            <div className="reel-info">
                                <h3 className="reel-blog-tag">BLOG</h3>
                                <p className="reel-blog-text">
                                    Ropa, zapatos 100 % cuero y accesorios diseñados para hombres contemporáneos que valoran la calidad, el detalle y el carácter.
                                </p>
                            </div>
                        </a>
                    ))}
                </div>
            </div>

            <style>{`
                .instagram-reels-section {
                    padding: 4rem 0;
                    background-color: #fff;
                    width: 100%;
                }

                .container {
                    max-width: 1440px;
                    margin: 0 auto;
                    padding: 0 4rem;
                }

                .reels-section-header {
                    text-align: center;
                    margin-bottom: 3rem;
                }

                .reels-section-title {
                    font-family: var(--font-titles);
                    color: var(--color-green, #155338);
                    font-size: 1.5rem;
                    margin-bottom: 1rem;
                    letter-spacing: 4px;
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .reels-section-description {
                    color: #666;
                    max-width: 700px;
                    margin: 0 auto;
                    font-size: 0.85rem;
                    line-height: 1.6;
                    font-family: 'Helvetica', 'Arial', sans-serif;
                    text-transform: none;
                    letter-spacing: 0.5px;
                }

                .reels-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 2rem;
                }

                .reel-card {
                    text-decoration: none;
                    color: inherit;
                    display: block;
                    transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                }

                .reel-card:hover {
                    transform: translateY(-8px);
                }

                .reel-image-container {
                    position: relative;
                    aspect-ratio: 4/5;
                    overflow: hidden;
                    border-radius: 0px;
                    background-color: #f5f5f5;
                }

                .reel-image {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .reel-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 40%);
                    padding: 1.5rem;
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-end;
                }

                .reel-stats {
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    font-weight: 600;
                    font-size: 1rem;
                    font-family: var(--font-paragraphs);
                }

                .reel-icon {
                    position: absolute;
                    top: 1.5rem;
                    right: 1.5rem;
                    color: rgba(255,255,255,0.9);
                    font-size: 0.9rem;
                    transform: rotate(45deg);
                }

                .reel-info {
                    margin-top: 1.5rem;
                    text-align: center;
                }

                .reel-blog-tag {
                    font-family: var(--font-titles);
                    color: var(--color-green, #155338);
                    font-size: 1.1rem;
                    font-weight: 700;
                    letter-spacing: 2px;
                    margin-bottom: 0.8rem;
                }

                .reel-blog-text {
                    font-size: 0.75rem;
                    color: #666;
                    line-height: 1.6;
                    max-width: 250px;
                    margin: 0 auto;
                    font-family: 'Helvetica', 'Arial', sans-serif;
                    text-transform: none;
                    letter-spacing: normal;
                }

                .reel-skeleton {
                    aspect-ratio: 4/5;
                    background: linear-gradient(90deg, #f8f8f8 25%, #f0f0f0 50%, #f8f8f8 75%);
                    background-size: 200% 100%;
                    animation: loading 1.5s infinite;
                }

                @keyframes loading {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }

                @media (max-width: 1024px) {
                    .container { padding: 0 2rem; }
                    .reels-grid { gap: 1.5rem; }
                }

                @media (max-width: 768px) {
                    .reels-grid {
                        grid-template-columns: 1fr;
                        gap: 3rem;
                    }
                    .container { padding: 0 1.5rem; }
                    .section-title { font-size: 1.25rem; }
                }
            `}</style>
        </section>
    );
}
