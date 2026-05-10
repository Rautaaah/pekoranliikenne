import updatePlaceStore from "../stores/updatePlaceStore";
import { useEffect, useState } from "react";
import ActionButton from "../../actionButton";
import useButtonStyles from "../../../styles/buttonStyles";
import { setUniverseMaxPlayers, setUniverseYear, setPlaceRobloxPlaceId, setUniversePrivacy, getUniverseConfiguration } from "../../../services/develop";
import { multiGetUniverseDetails } from "../../../services/games";

const Access = (props) => {
  const s = useButtonStyles();
  const store = updatePlaceStore.useContainer();
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [feedback, setFeedback] = useState(null);
  const [year, setSelectedYear] = useState(2017);
  const [robloxPlaceId, setRobloxPlaceId] = useState(1818);
  const [privacyType, setPrivacyType] = useState(1);
  const [gearsEnabled, setGearsEnabled] = useState(false);
  
  const resetForm = () => {
    setFeedback(null);
    setMaxPlayers(store.details.maxPlayerCount);
    setSelectedYear(store.details.year);
    setRobloxPlaceId(store.details.robloxPlaceId)
    multiGetUniverseDetails({ universeIds: [store.details.universeId] }).then(result => {
      if (result?.[0]?.privacyType !== undefined && result?.[0]?.privacyType !== null) {
        setPrivacyType(result[0].privacyType === 1 || result[0].privacyType === 'Public' ? 1 : 3);
      }
    }).catch(() => {});
    getUniverseConfiguration({ universeId: store.details.universeId })
      .then(result => {
        setGearsEnabled(!!result?.areGearsEnabled);
      })
      .catch(() => {});
  };

  const save = () => {
    store.setLocked(true);
    setFeedback(null);
    setUniverseYear({
      universeId: store.details.universeId,
      year: year,
    });
    setPlaceRobloxPlaceId({
      placeId: store.details.placeId,
      robloxPlaceId: robloxPlaceId,
    })
    setUniversePrivacy({
      universeId: store.details.universeId,
      privacyType: privacyType,
      areGearsEnabled: gearsEnabled,
    });
    setUniverseMaxPlayers({
      universeId: store.details.universeId,
      maxPlayers: maxPlayers,
    })
      .then(() => {
        window.location.reload();
      })
      .catch((e) => {
        store.setLocked(false);
        setFeedback(e.message);
      });
  };

  useEffect(() => {
    resetForm();
  }, [store.details]);

  return (
    <div className="row mt-4">
      <div className="col-12">
        <h2 className="fw-200f mb-4">Access</h2>
        {feedback ? <p className="text-danger">{feedback}</p> : null}
        <div>
          <p className="fw-bold">Maximum Visitor Count:</p>
          <select
            value={maxPlayers}
            className="br-none border-1 border-secondary pe-2"
            onChange={(v) => {
              setMaxPlayers(parseInt(v.currentTarget.value, 10));
            }}
          >
            {[...new Array(99)].map((_, i) => {
              return (
                <option value={i + 1} key={i}>
                  {i + 1}
                </option>
              );
            })}
          </select>
          <p className="fw-bold">Select Year:</p>
          <select
            value={year}
            className="br-none border-1 border-secondary pe-2"
            onChange={(v) => {
              setSelectedYear(parseInt(v.currentTarget.value));
            }}
          >
            {/*<option value={2015}>2015</option>*/}
            {/*<option value={2016}>2016</option>*/}
            <option value={2017}>2017</option>
            <option value={2018}>2018</option>
            <option value={2020}>2020</option>
            <option value={2021}>2021</option>
          </select>
          <p className="fw-bold">Animation/Audio place ID:</p>
          <input type='number' className='w-50' value={robloxPlaceId} onChange={(v) => {
            setRobloxPlaceId(parseInt(v.currentTarget.value));
          }} />
          <p className="fw-bold mt-3">Who can access this game?</p>
          <select
            value={privacyType}
            className="br-none border-1 border-secondary pe-2"
            onChange={(v) => {
              setPrivacyType(parseInt(v.currentTarget.value, 10));
            }}
          >
            <option value={1}>Everyone</option>
            <option value={3}>Private</option>
          </select>
          <p className="fw-bold mt-3">Gears:</p>
          <label className="d-flex align-items-center" style={{ gap: "8px" }}>
            <input
              type="checkbox"
              checked={!!gearsEnabled}
              onChange={(v) => setGearsEnabled(v.currentTarget.checked)}
            />
            <span>Enable gears in this game</span>
          </label>
        </div>
        <div className="mt-4">
          <div className="d-inline-block">
            <ActionButton
              disabled={store.locked}
              className={s.normal + " " + s.continueButton}
              label="Save"
              onClick={save}
            />
          </div>
          <div className="d-inline-block ms-4">
            <ActionButton
              disabled={store.locked}
              className={s.normal + " " + s.cancelButton}
              label="Cancel"
              onClick={() => {
                resetForm();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Access;
