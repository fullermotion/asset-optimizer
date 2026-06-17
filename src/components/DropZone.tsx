import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpFromBracket, faFileImage, faFileVideo } from "@fortawesome/free-solid-svg-icons";

interface DropZoneProps {
  dragging: boolean;
  onChooseFiles: () => void;
}

export function DropZone({ dragging, onChooseFiles }: DropZoneProps) {
  return (
    <section className={`drop-zone ${dragging ? "is-dragging" : ""}`}>
      <div className="drop-art" aria-hidden="true">
        <span>
          <FontAwesomeIcon icon={faFileImage} />
        </span>
        <span>
          <FontAwesomeIcon icon={faFileVideo} />
        </span>
      </div>
      <h2>Drop assets</h2>
      <p>Images and videos are added to the queue with thumbnails, file details, and rename previews.</p>
      <button className="button primary" type="button" onClick={onChooseFiles}>
        <FontAwesomeIcon icon={faArrowUpFromBracket} />
        <span>Select files</span>
      </button>
    </section>
  );
}
