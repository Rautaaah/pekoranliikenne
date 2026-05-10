import {createUseStyles} from "react-jss";
import {useEffect, useState} from "react";
import {getGameTemplates} from "../../../../services/games";

const useStyles = createUseStyles({
    subtitle: {
        display: 'block',
        fontSize: 22,
        fontWeight: 600,
        marginBottom: 10,
    },
    templatesContainer: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: '16px 14px',
        '@media (max-width: 1200px)': {
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        },
        '@media (max-width: 900px)': {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        },
        '@media (max-width: 620px)': {
            gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
        },
    },
    templateContainer: {
        padding: '10px',
        border: '1px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'transparent',
        '&:hover': {
            cursor: 'pointer',
            borderColor: '#AAA5A8',
        }
    },
    templateSelected: {
        borderColor: '#AAA5A8',
    },
    templateThumbContainer: { // TODO: container might not be necessary but idrc to test rn
        display: 'flex',
        width: '100%',
        height: '120px',
        overflow: 'hidden',
        '& img': {
            width: '100%',
            height: '120px',
            display: 'inline-block',
            objectFit: 'cover',
        }
    },
    templateName: {
        fontSize: 12,
        padding: 5,
        paddingBottom: 3,
        textAlign: 'center',
    },
})

const Templates = props => {
    const s = useStyles();
    // 0 = loading, 1 = failed, 2 = empty array, array = suiccess
    const [templates, setTemplates] = useState(0);
    
    useEffect(() => {
        if (typeof templates === 'number' && templates === 0) {
            setTemplates(0);
            getGameTemplates().then(d => {
                if (Array.isArray(d)) {
                    if (d.length <= 0) {
                        setTemplates(2)
                        return;
                    }
                    setTemplates(d);
                } else {
                    setTemplates(1);
                }
            })
        }
    }, []);
    
    const preferredOrder = [
        'Flat Terrain',
        'Racing',
        'Obby',
        'City',
        'Western',
        'Line Runner',
        'Suburban',
        'Village',
        'Capture The Flag',
        'Team/FFA Arena',
        'Combat',
        'Baseplate',
        'Castle',
        'Pirate Island',
        'Starting Place',
        'Classic Baseplate',
        'Classic Obby',
    ];

    const sortTemplates = (arr) => {
        const rank = (name) => {
            const i = preferredOrder.findIndex(v => v.toLowerCase() === String(name || '').toLowerCase());
            return i === -1 ? 999 : i;
        };
        return [...arr].sort((a, b) => {
            const aName = a?.universe?.name || a?.name || '';
            const bName = b?.universe?.name || b?.name || '';
            const diff = rank(aName) - rank(bName);
            if (diff !== 0) return diff;
            return String(aName).localeCompare(String(bName));
        });
    };

    return <div className='container'>
        <span className={s.subtitle}>GAME TEMPLATES</span>
        <div className={s.templatesContainer}>
            {templates === 0 ? <span>Loading Templates...</span> :
                templates === 2 ? <span>No Templates Found</span> : Array.isArray(templates) ?
                    sortTemplates(templates).map(template =>
                        (() => {
                            const rootPlaceId = Number(
                                template?.universe?.rootPlaceId ??
                                template?.universe?.rootplaceId ??
                                template?.universe?.RootPlaceId ??
                                template?.rootPlaceId
                            );
                            const universeName = template?.universe?.name || template?.name || `Template ${rootPlaceId}`;
                            if (!Number.isFinite(rootPlaceId) || rootPlaceId <= 0) return null;
                            return (
                        <div
                            key={rootPlaceId}
                            className={`${s.templateContainer} ${props.template === rootPlaceId ? s.templateSelected : undefined}`}
                            onClick={e => {
                                e.preventDefault();
                                props.setTemplate(rootPlaceId);
                            }}>
                            <div className={s.templateThumbContainer}>
                                <img
                                    src={`/thumbs/place.ashx?assetId=${rootPlaceId}`}
                                    onError={(e) => {
                                        e.currentTarget.src = '/img/noresults.png';
                                    }}
                                />
                            </div>
                            <span className={s.templateName}>{universeName}</span>
                        </div>
                            );
                        })()
                    )
                    :
                    <span>Couldn't load templates, try again later.</span>
            }
        </div>
    </div>
}

export default Templates;
